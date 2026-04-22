import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { syncEntryStatusAsync } from '../../search/sync.js'
import type { EntryStatus } from '../../store/index.js'
import { requireAdmin } from './middleware.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  entry_type: z.enum(['post', 'report']).optional(),
  status: z.enum(['live', 'pending', 'deleted']).optional(),
  source: z.enum(['form', 'api']).optional(),
  q: z.string().trim().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
})

const entryParamsSchema = z.object({ id: z.string().min(1).max(64) })

const statusActionSchema = z.object({
  action: z.enum(['delete', 'restore', 'approve', 'reject']),
  reason: z.string().max(500).optional(),
})

const purgeSchema = z.object({
  confirmation: z.string(),
  reason: z.string().max(500).optional(),
})

/** Map action verbs to target entry statuses. */
function statusForAction(action: string, currentStatus: EntryStatus): EntryStatus {
  if (action === 'delete') return 'deleted'
  if (action === 'restore') return currentStatus === 'deleted' ? 'live' : currentStatus
  if (action === 'approve') return 'live'
  if (action === 'reject') return 'deleted'
  return currentStatus
}

/** Register admin entry list and detail routes. */
export async function adminEntryRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/entries', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) { reply.status(400).send({ error: 'invalid_input' }); return }
    const { page, sort, ...filters } = parsed.data
    const offset = (page - 1) * PAGE_SIZE
    const storeFilters = {
      entryType: filters.entry_type, status: filters.status, source: filters.source,
      query: filters.q, dateFrom: filters.date_from, dateTo: filters.date_to, sort,
    }
    const [items, total] = await Promise.all([store.listAdminEntries(PAGE_SIZE, offset, storeFilters), store.countAdminEntries(storeFilters)])
    reply.status(200).send({ items, page, page_size: PAGE_SIZE, total })
  })

  app.get('/api/admin/entries/:id', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = entryParamsSchema.safeParse(request.params)
    if (!parsed.success) { reply.status(404).send({ error: 'not_found' }); return }
    const entry = await store.getAdminEntryDetail(parsed.data.id)
    if (entry === null) { reply.status(404).send({ error: 'not_found' }); return }
    const auditLog = await store.listAuditLogForTarget(entry.id)
    reply.status(200).send({ ...entry, audit_log: auditLog })
  })
}

/** Register admin entry action routes (delete, restore, purge). */
export async function adminEntryActionRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.post('/api/admin/entries/:id/action', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = entryParamsSchema.safeParse(request.params)
    if (!params.success) { reply.status(404).send({ error: 'not_found' }); return }
    const body = statusActionSchema.safeParse(request.body)
    if (!body.success) { reply.status(400).send({ error: 'invalid_input' }); return }
    const entry = await store.getAdminEntryDetail(params.data.id)
    if (entry === null) { reply.status(404).send({ error: 'not_found' }); return }
    const newStatus = statusForAction(body.data.action, entry.status)
    await store.updateEntryStatus(entry.id, entry.entryType, newStatus)
    await store.insertAuditEntry(request.admin!.id, body.data.action, entry.id, entry.entryType, body.data.reason ?? null)
    syncEntryStatusAsync(app, request.log, entry.id, entry.entryType, newStatus)
    reply.status(200).send({ status: 'ok', entry_id: entry.id, action: body.data.action })
  })

  app.post('/api/admin/entries/:id/purge', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = entryParamsSchema.safeParse(request.params)
    if (!params.success) { reply.status(404).send({ error: 'not_found' }); return }
    const body = purgeSchema.safeParse(request.body)
    if (!body.success) { reply.status(400).send({ error: 'invalid_input' }); return }
    const entry = await store.getAdminEntryDetail(params.data.id)
    if (entry === null) { reply.status(404).send({ error: 'not_found' }); return }
    const expected = `${entry.id} PURGE`
    if (body.data.confirmation !== expected) {
      reply.status(400).send({ error: 'invalid_input', message: `Type "${expected}" to confirm.` }); return
    }
    await store.purgeEntry(entry.id, entry.entryType)
    await store.insertAuditEntry(request.admin!.id, 'purge', entry.id, entry.entryType, body.data.reason ?? null)
    syncEntryStatusAsync(app, request.log, entry.id, entry.entryType, 'purged')
    reply.status(200).send({ status: 'ok', entry_id: entry.id, action: 'purge' })
  })
}
