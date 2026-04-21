import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { requireAdmin } from './middleware.js'

const PAGE_SIZE = 100

const listQuerySchema = z.object({
  admin_id: z.string().optional(),
  action: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
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
