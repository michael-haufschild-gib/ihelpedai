import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'

import { syncEntryStatusAsync } from '../../search/sync.js'
import { requireAdmin } from './middleware.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
})

const actionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

/** Apply a queue action to a single entry id; returns ok/skipped for bulk loop. */
async function applyQueueAction(
  app: FastifyInstance,
  request: FastifyRequest,
  id: string,
  action: 'approve' | 'reject',
  reason: string | null,
): Promise<boolean> {
  const entry = await app.store.getAdminEntryDetail(id)
  if (!entry || entry.status !== 'pending') return false
  const newStatus = action === 'approve' ? 'live' : 'deleted'
  await app.store.updateEntryStatus(entry.id, entry.entryType, newStatus)
  syncEntryStatusAsync(app, request.log, entry.id, entry.entryType, newStatus)
  await app.store.insertAuditEntry(request.admin!.id, action, entry.id, entry.entryType, reason)
  return true
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

  app.get('/api/admin/queue/count', { preHandler: [requireAdmin] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const count = await store.countAdminEntries({ status: 'pending', source: 'api' })
    reply.status(200).send({ count })
  })

  app.post('/api/admin/queue/:id/action', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const body = actionSchema.safeParse(request.body)
    if (!body.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const ok = await applyQueueAction(app, request, params.data.id, body.data.action, body.data.reason ?? null)
      .catch((err: unknown) => {
        request.log.error({ err, entryId: params.data.id }, 'queue action failed')
        return false
      })
    if (!ok) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    reply.status(200).send({ status: 'ok', entry_id: params.data.id, action: body.data.action })
  })

  app.post('/api/admin/queue/bulk', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = bulkActionSchema.safeParse(request.body)
    if (!body.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const results: { id: string; ok: boolean }[] = []
    for (const id of body.data.ids) {
      const ok = await applyQueueAction(app, request, id, body.data.action, body.data.reason ?? null)
        .catch((err: unknown) => {
          request.log.error({ err, entryId: id }, 'bulk action failed for entry')
          return false
        })
      results.push({ id, ok })
    }
    reply.status(200).send({ status: 'ok', results })
  })
}
