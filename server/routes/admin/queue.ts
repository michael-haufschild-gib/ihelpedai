import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'

import { syncEntryStatusAsync } from '../../search/sync.js'
import { adminRouteIdField, idParamsSchema } from './ids.js'
import { getRequestAdmin, requireAdmin } from './middleware.js'
import { adminPageQueryField } from './pagination.js'
import { sanitizeOptionalAdminFreeText } from './sanitize-admin-text.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  page: adminPageQueryField,
})

const actionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

const bulkActionSchema = z.object({
  ids: z.array(adminRouteIdField).min(1).max(100),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

type QueueActionResult = 'ok' | 'not_found'

/**
 * Apply a queue action to a single entry id. Returns `'not_found'` only when
 * the entry is missing or not pending; any other failure (store write, audit
 * insert) throws so the route layer surfaces it as a 500 instead of hiding it
 * behind a misleading 404.
 */
async function applyQueueAction(
  app: FastifyInstance,
  request: FastifyRequest,
  id: string,
  action: 'approve' | 'reject',
  reason: string | null,
): Promise<QueueActionResult> {
  const entry = await app.store.getAdminEntryDetail(id)
  if (!entry || entry.status !== 'pending') return 'not_found'
  const newStatus = action === 'approve' ? 'live' : 'deleted'
  const actor = getRequestAdmin(request)
  await app.store.updateEntryStatusWithAudit(entry.id, entry.entryType, newStatus, {
    adminId: actor.id,
    action,
    targetId: entry.id,
    targetKind: entry.entryType,
    details: reason,
  })
  syncEntryStatusAsync(app, request.log, entry.id, entry.entryType, newStatus)
  return 'ok'
}

/** Register moderation queue routes. */
export async function adminQueueRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/queue', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const { page } = parsed.data
    const offset = (page - 1) * PAGE_SIZE
    const filters = { status: 'pending' as const, source: 'api' as const }
    const [items, total] = await Promise.all([
      store.listAdminEntries(PAGE_SIZE, offset, filters),
      store.countAdminEntries(filters),
    ])
    reply.status(200).send({ items, page, page_size: PAGE_SIZE, total })
  })

  app.get(
    '/api/admin/queue/count',
    { preHandler: [requireAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const count = await store.countAdminEntries({ status: 'pending', source: 'api' })
      reply.status(200).send({ count })
    },
  )

  app.post(
    '/api/admin/queue/:id/action',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const body = actionSchema.safeParse(request.body)
      if (!body.success) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      const reason = await sanitizeOptionalAdminFreeText(store, body.data.reason)
      const result = await applyQueueAction(app, request, params.data.id, body.data.action, reason)
      if (result === 'not_found') {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      reply.status(200).send({ status: 'ok', entry_id: params.data.id, action: body.data.action })
    },
  )

  app.post(
    '/api/admin/queue/bulk',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = bulkActionSchema.safeParse(request.body)
      if (!body.success) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      // Bulk runs strictly sequentially. Three forces drive that choice;
      // none of them is performance-related, so do not "optimise" by
      // switching to Promise.all without re-deriving the contract:
      //
      //   1. Audit-log ordering. Each per-id apply opens its own
      //      `updateEntryStatusWithAudit` transaction; sequential
      //      execution gives every audit row a strictly increasing
      //      `created_at` so an auditor reading the log can
      //      reconstruct the exact order the admin's bulk landed.
      //   2. Result-array ordering. The 200 response carries
      //      `results: [{id, ok}]` ordered by the request's `ids[]`
      //      so the UI can pair each row with its outcome. The order
      //      contract is locked by admin-queue-actions.spec.ts:247.
      //   3. Partial-success semantics. Per-id "not pending" returns
      //      `ok: false` and continues. A genuine store/audit failure
      //      throws and a 500 propagates, with rows up to that index
      //      already committed. Wrapping the loop in a single outer
      //      transaction would change that to all-or-nothing on hard
      //      errors — arguably safer, but it breaks the documented
      //      partial-success contract and requires restructuring
      //      `applyQueueAction` to share one connection. Out of scope.
      const results: { id: string; ok: boolean }[] = []
      const reason = await sanitizeOptionalAdminFreeText(store, body.data.reason)
      for (const id of body.data.ids) {
        const result = await applyQueueAction(app, request, id, body.data.action, reason)
        results.push({ id, ok: result === 'ok' })
      }
      reply.status(200).send({ status: 'ok', results })
    },
  )
}
