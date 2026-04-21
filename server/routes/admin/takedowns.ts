import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { requireAdmin } from './middleware.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

/** Reject garbage dates like '2026-13-40' that a plain length check would accept. */
const isValidIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const [, y, m, d] = match
  const date = new Date(`${value}T00:00:00Z`)
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d)
  )
}

const createSchema = z.object({
  requester_email: z.string().email().max(255).nullable().optional(),
  entry_id: z.string().max(64).nullable().optional(),
  entry_kind: z.enum(['post', 'report']).nullable().optional(),
  reason: z.string().min(1).max(2000),
  date_received: z.string().refine(isValidIsoDate, { message: 'invalid_date' }),
})

const updateSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  disposition: z.enum(['entry_deleted', 'entry_kept', 'entry_edited', 'other']).optional(),
  notes: z.string().max(5000).optional(),
})

/** Register admin takedown request routes. */
export async function adminTakedownRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/takedowns', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const { page, status } = parsed.data
    const offset = (page - 1) * PAGE_SIZE
    const [items, total] = await Promise.all([
      store.listTakedowns(PAGE_SIZE, offset, status),
      store.countTakedowns(status),
    ])
    reply.status(200).send({ items, page, page_size: PAGE_SIZE, total })
  })

  app.get('/api/admin/takedowns/:id', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const takedown = await store.getTakedown(params.data.id)
    if (!takedown) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    reply.status(200).send(takedown)
  })

  app.post('/api/admin/takedowns', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input', fields: parsed.error.flatten().fieldErrors })
      return
    }
    const takedown = await store.insertTakedown({
      requesterEmail: parsed.data.requester_email ?? null,
      entryId: parsed.data.entry_id ?? null,
      entryKind: parsed.data.entry_kind ?? null,
      reason: parsed.data.reason,
      dateReceived: parsed.data.date_received,
    })
    await store.insertAuditEntry(
      request.admin!.id,
      'create_takedown',
      takedown.id,
      'takedown',
      null,
    )
    reply.status(201).send(takedown)
  })

  app.patch('/api/admin/takedowns/:id', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const body = updateSchema.safeParse(request.body)
    if (!body.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const takedown = await store.getTakedown(params.data.id)
    if (!takedown) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const updateFields = { ...body.data } as Parameters<typeof store.updateTakedown>[1]
    if (body.data.status === 'closed') updateFields.closedBy = request.admin!.id
    else if (body.data.status === 'open') updateFields.closedBy = null
    await store.updateTakedown(params.data.id, updateFields)
    await store.insertAuditEntry(
      request.admin!.id,
      'update_takedown',
      takedown.id,
      'takedown',
      body.data.disposition ?? null,
    )
    const updated = await store.getTakedown(params.data.id)
    reply.status(200).send(updated)
  })
}
