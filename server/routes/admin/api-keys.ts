import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { requireAdmin } from './middleware.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  status: z.enum(['active', 'revoked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

const revokeSchema = z.object({
  confirmation: z.literal('REVOKE'),
  reason: z.string().max(500).optional(),
})

/** Register admin API key management routes. */
export async function adminApiKeyRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/api-keys', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const { page, status } = parsed.data
    const offset = (page - 1) * PAGE_SIZE
    const [items, total] = await Promise.all([
      store.listApiKeys(PAGE_SIZE, offset, status),
      store.countApiKeys(status),
    ])
    reply.status(200).send({ items, page, page_size: PAGE_SIZE, total })
  })

  app.get('/api/admin/api-keys/:id', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const key = await store.getApiKey(params.data.id)
    if (!key) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const recentReports = await store.listReportsForApiKey(key.emailHash, 20)
    reply.status(200).send({ ...key, recent_reports: recentReports })
  })

  app.post('/api/admin/api-keys/:id/revoke', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    const body = revokeSchema.safeParse(request.body)
    if (!body.success) {
      reply.status(400).send({ error: 'invalid_input', message: 'Type "REVOKE" to confirm.' })
      return
    }
    const key = await store.getApiKey(params.data.id)
    if (!key) {
      reply.status(404).send({ error: 'not_found' })
      return
    }
    await store.revokeApiKey(key.id)
    await store.insertAuditEntry(
      request.admin!.id,
      'revoke_key',
      key.id,
      'api_key',
      body.data.reason ?? null,
    )
    reply.status(200).send({ status: 'ok' })
  })
}
