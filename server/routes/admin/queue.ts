import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

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
    const entry = await store.getAdminEntryDetail(params.data.id)
    if (!entry || entry.status !== 'pending') {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const newStatus = body.data.action === 'approve' ? 'live' : 'deleted'
    await store.updateEntryStatus(entry.id, entry.entryType, newStatus)
    try {
      await store.insertAuditEntry(
        request.admin!.id,
        body.data.action,
        entry.id,
        entry.entryType,
        body.data.reason ?? null,
      )
    } catch (err) {
      request.log.error({ err, entryId: entry.id }, 'failed to write audit entry for queue action')
    }
    reply.status(200).send({ status: 'ok', entry_id: entry.id, action: body.data.action })
  })

  app.post('/api/admin/queue/bulk', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = bulkActionSchema.safeParse(request.body)
    if (!body.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const results: { id: string; ok: boolean }[] = []
    for (const id of body.data.ids) {
      try {
        const entry = await store.getAdminEntryDetail(id)
        if (!entry || entry.status !== 'pending') {
          results.push({ id, ok: false })
          continue
        }
        const newStatus = body.data.action === 'approve' ? 'live' : 'deleted'
        await store.updateEntryStatus(entry.id, entry.entryType, newStatus)
        await store.insertAuditEntry(
          request.admin!.id,
          body.data.action,
          entry.id,
          entry.entryType,
          body.data.reason ?? null,
        )
        results.push({ id, ok: true })
      } catch (err) {
        request.log.error({ err, entryId: id }, 'bulk action failed for entry')
        results.push({ id, ok: false })
      }
    }
    reply.status(200).send({ status: 'ok', results })
  })
}
