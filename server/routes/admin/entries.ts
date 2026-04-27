import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { isValidIsoDate } from '../../lib/iso-date.js'
import { syncEntryStatusAsync } from '../../search/sync.js'
import type { AuditEntryWithEmail, EntryStatus } from '../../store/index.js'
import { idParamsSchema } from './ids.js'
import { getRequestAdmin, requireAdmin } from './middleware.js'
import { adminPageQueryField } from './pagination.js'
import { sanitizeOptionalAdminFreeText } from './sanitize-admin-text.js'

const PAGE_SIZE = 50

// Accept empty string (UI clear) or YYYY-MM-DD; reject typos so the SQL
// comparison never runs against garbage and returns an empty page. Transform
// '' → undefined so the store receives a truly absent filter: otherwise the
// SQL `< date('', '+1 day')` evaluates to NULL and filters out every row,
// turning "cleared date_to" into a silent empty list.
const dateQueryField = z
  .string()
  .refine((v) => v === '' || isValidIsoDate(v), { message: 'invalid_date' })
  .transform((v) => (v === '' ? undefined : v))
  .optional()

const listQuerySchema = z.object({
  entry_type: z.enum(['post', 'report']).optional(),
  status: z.enum(['live', 'pending', 'deleted']).optional(),
  source: z.enum(['form', 'api']).optional(),
  q: z.string().trim().max(200).optional(),
  date_from: dateQueryField,
  date_to: dateQueryField,
  sort: z.enum(['asc', 'desc']).default('desc'),
  page: adminPageQueryField,
})

const entryParamsSchema = idParamsSchema

const statusActionSchema = z.object({
  action: z.enum(['delete', 'restore', 'approve', 'reject']),
  reason: z.string().max(500).optional(),
})

const purgeSchema = z.object({
  confirmation: z.string(),
  reason: z.string().max(500).optional(),
})

type StatusAction = z.infer<typeof statusActionSchema>['action']

/** Validate action verbs against current entry state. */
function canApplyStatusAction(action: StatusAction, currentStatus: EntryStatus): boolean {
  if (action === 'approve' || action === 'reject') return currentStatus === 'pending'
  if (action === 'delete') return currentStatus === 'live'
  return currentStatus === 'deleted'
}

/** Infer restore target from the status-changing audit event that deleted it. */
function restoreStatusFromAudit(auditLog: AuditEntryWithEmail[]): EntryStatus {
  const deletedBy = auditLog.find((entry) => entry.action === 'reject' || entry.action === 'delete')
  return deletedBy?.action === 'reject' ? 'pending' : 'live'
}

/** Map valid action verbs to target entry statuses. */
function statusForAction(action: StatusAction, restoreStatus: EntryStatus): EntryStatus {
  if (action === 'approve') return 'live'
  if (action === 'restore') return restoreStatus
  return 'deleted'
}

/** Register admin entry list and detail routes. */
export async function adminEntryRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get(
    '/api/admin/entries',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      const { page, sort, ...filters } = parsed.data
      const offset = (page - 1) * PAGE_SIZE
      const storeFilters = {
        entryType: filters.entry_type,
        status: filters.status,
        source: filters.source,
        query: filters.q,
        dateFrom: filters.date_from,
        dateTo: filters.date_to,
        sort,
      }
      const [items, total] = await Promise.all([
        store.listAdminEntries(PAGE_SIZE, offset, storeFilters),
        store.countAdminEntries(storeFilters),
      ])
      reply.status(200).send({ items, page, page_size: PAGE_SIZE, total })
    },
  )

  app.get(
    '/api/admin/entries/:id',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = entryParamsSchema.safeParse(request.params)
      if (!parsed.success) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const entry = await store.getAdminEntryDetail(parsed.data.id)
      if (entry === null) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const auditLog = await store.listAuditLogForTarget(entry.id)
      reply.status(200).send({ ...entry, audit_log: auditLog })
    },
  )
}

/** Register admin entry action routes (delete, restore, purge). */
export async function adminEntryActionRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.post(
    '/api/admin/entries/:id/action',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = entryParamsSchema.safeParse(request.params)
      if (!params.success) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const body = statusActionSchema.safeParse(request.body)
      if (!body.success) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      const entry = await store.getAdminEntryDetail(params.data.id)
      if (entry === null) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      if (!canApplyStatusAction(body.data.action, entry.status)) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      const auditLog = body.data.action === 'restore' ? await store.listAuditLogForTarget(entry.id) : []
      const newStatus = statusForAction(body.data.action, restoreStatusFromAudit(auditLog))
      const actor = getRequestAdmin(request)
      const reason = await sanitizeOptionalAdminFreeText(store, body.data.reason)
      await store.updateEntryStatusWithAudit(entry.id, entry.entryType, newStatus, {
        adminId: actor.id,
        action: body.data.action,
        targetId: entry.id,
        targetKind: entry.entryType,
        details: reason,
      })
      syncEntryStatusAsync(app, request.log, entry.id, entry.entryType, newStatus)
      reply.status(200).send({ status: 'ok', entry_id: entry.id, action: body.data.action })
    },
  )

  app.post(
    '/api/admin/entries/:id/purge',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = entryParamsSchema.safeParse(request.params)
      if (!params.success) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const body = purgeSchema.safeParse(request.body)
      if (!body.success) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      const entry = await store.getAdminEntryDetail(params.data.id)
      if (entry === null) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const expected = `${entry.id} PURGE`
      if (body.data.confirmation !== expected) {
        reply.status(400).send({ error: 'invalid_input', message: `Type "${expected}" to confirm.` })
        return
      }
      const actor = getRequestAdmin(request)
      const reason = await sanitizeOptionalAdminFreeText(store, body.data.reason)
      await store.purgeEntryWithAudit(entry.id, entry.entryType, {
        adminId: actor.id,
        action: 'purge',
        targetId: entry.id,
        targetKind: entry.entryType,
        details: reason,
      })
      syncEntryStatusAsync(app, request.log, entry.id, entry.entryType, 'purged')
      reply.status(200).send({ status: 'ok', entry_id: entry.id, action: 'purge' })
    },
  )
}
