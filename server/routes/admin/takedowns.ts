import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { isValidIsoDate } from '../../lib/iso-date.js'
import { zodFieldErrors } from '../../lib/zod-field-errors.js'
import type { Store } from '../../store/index.js'
import { idParamsSchema } from './ids.js'
import { getRequestAdmin, requireAdmin } from './middleware.js'
import { adminPageQueryField } from './pagination.js'
import { sanitizeAdminFreeText, sanitizeOptionalAdminFreeText } from './sanitize-admin-text.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  page: adminPageQueryField,
})

const createSchema = z.object({
  requester_email: z.string().email().max(255).nullable().optional(),
  entry_id: z.string().trim().max(64).nullable().optional(),
  entry_kind: z.enum(['post', 'report']).nullable().optional(),
  reason: z.string().min(1).max(2000),
  date_received: z.string().refine(isValidIsoDate, { message: 'invalid_date' }),
})

const updateSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  disposition: z.enum(['entry_deleted', 'entry_kept', 'entry_edited', 'other']).optional(),
  notes: z.string().max(5000).optional(),
})

type TakedownEntryReference = {
  entryId: string | null
  entryKind: 'post' | 'report' | null
}

/**
 * Canonicalize optional takedown entry references. The admin UI submits only
 * `entry_id`, so the server infers the kind from the source-of-truth entry
 * table and rejects impossible or contradictory pairs.
 */
async function resolveTakedownEntryReference(
  store: Store,
  input: z.infer<typeof createSchema>,
  reply: FastifyReply,
): Promise<TakedownEntryReference | null> {
  const entryId =
    input.entry_id === undefined || input.entry_id === null || input.entry_id === '' ? null : input.entry_id
  const requestedKind = input.entry_kind ?? null
  if (entryId === null && requestedKind !== null) {
    reply.status(400).send({ error: 'invalid_input', fields: { entry_id: 'entry_id_required' } })
    return null
  }
  if (entryId === null) return { entryId: null, entryKind: null }

  const entry = await store.getAdminEntryDetail(entryId)
  if (entry === null) {
    reply.status(400).send({ error: 'invalid_input', fields: { entry_id: 'entry_not_found' } })
    return null
  }
  if (requestedKind !== null && requestedKind !== entry.entryType) {
    reply.status(400).send({ error: 'invalid_input', fields: { entry_kind: 'entry_kind_mismatch' } })
    return null
  }
  return { entryId, entryKind: entry.entryType }
}

/** Create a takedown row from validated admin input. */
async function handleCreateTakedown(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const store = app.store
  const parsed = createSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.status(400).send({ error: 'invalid_input', fields: zodFieldErrors(parsed.error) })
    return
  }
  const entryReference = await resolveTakedownEntryReference(store, parsed.data, reply)
  if (entryReference === null) return
  const actor = getRequestAdmin(request)
  const takedown = await store.insertTakedownWithAudit(
    {
      requesterEmail: parsed.data.requester_email ?? null,
      entryId: entryReference.entryId,
      entryKind: entryReference.entryKind,
      reason: await sanitizeAdminFreeText(store, parsed.data.reason),
      dateReceived: parsed.data.date_received,
    },
    {
      adminId: actor.id,
      action: 'create_takedown',
      targetId: null,
      targetKind: 'takedown',
      details: null,
    },
  )
  reply.status(201).send(takedown)
}

/** Update takedown fields and record the admin action. */
async function handleUpdateTakedown(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const store = app.store
  const params = idParamsSchema.safeParse(request.params)
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
  if (body.data.notes !== undefined) {
    updateFields.notes = (await sanitizeOptionalAdminFreeText(store, body.data.notes)) ?? ''
  }
  const actor = getRequestAdmin(request)
  if (body.data.status === 'closed') updateFields.closedBy = actor.id
  else if (body.data.status === 'open') updateFields.closedBy = null
  await store.updateTakedownWithAudit(params.data.id, updateFields, {
    adminId: actor.id,
    action: 'update_takedown',
    targetId: takedown.id,
    targetKind: 'takedown',
    details: body.data.disposition ?? null,
  })
  const updated = await store.getTakedown(params.data.id)
  reply.status(200).send(updated)
}

/** Register admin takedown request routes. */
export async function adminTakedownRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get(
    '/api/admin/takedowns',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    },
  )

  app.get(
    '/api/admin/takedowns/:id',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamsSchema.safeParse(request.params)
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
    },
  )

  app.post(
    '/api/admin/takedowns',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await handleCreateTakedown(app, request, reply)
    },
  )

  app.patch(
    '/api/admin/takedowns/:id',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await handleUpdateTakedown(app, request, reply)
    },
  )
}
