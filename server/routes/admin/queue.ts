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
      // Bulk tolerates per-entry misses (404-equivalent) but still surfaces
      // write/audit failures as a 500 so callers do not silently retry on
      // partially-applied status changes.
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
