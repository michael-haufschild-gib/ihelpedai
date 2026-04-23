import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { isValidIsoDate } from '../../lib/iso-date.js'
import { requireAdmin } from './middleware.js'

const PAGE_SIZE = 100

// Empty string (UI clear) and YYYY-MM-DD are the only accepted inputs.
// Allowing any string would let typos pass through to the SQL comparison
// where they'd silently match zero rows — no error, just a confusing
// empty page. Reject at the schema boundary instead.
//
// The transform collapses '' to undefined so the store receives a truly
// absent filter rather than an empty string. Without the transform, the
// store's `!== undefined` check treats '' as a filter value and the SQL
// `< date('', '+1 day')` evaluates to NULL — the comparison is NULL, so
// the WHERE clause filters out every row. A cleared date_to would then
// render an empty audit log instead of "show everything".
const dateQueryField = z
  .string()
  .refine((v) => v === '' || isValidIsoDate(v), { message: 'invalid_date' })
  .transform((v) => (v === '' ? undefined : v))
  .optional()

const listQuerySchema = z.object({
  admin_id: z.string().optional(),
  action: z.string().optional(),
  date_from: dateQueryField,
  date_to: dateQueryField,
  page: z.coerce.number().int().min(1).default(1),
})

/** Register admin audit log routes. */
export async function adminAuditRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/audit', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const { page, ...filters } = parsed.data
    const offset = (page - 1) * PAGE_SIZE
    const storeFilters = {
      adminId: filters.admin_id,
      action: filters.action,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
    }
    const [items, total] = await Promise.all([
      store.listAuditLog(PAGE_SIZE, offset, storeFilters),
      store.countAuditLog(storeFilters),
    ])
    reply.status(200).send({ items, page, page_size: PAGE_SIZE, total })
  })
}
