import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import type { AdminApiKey } from '../../store/index.js'
import { idParamsSchema } from './ids.js'
import { getRequestAdmin, requireAdmin } from './middleware.js'
import { adminPageQueryField } from './pagination.js'
import { sanitizeOptionalAdminFreeText } from './sanitize-admin-text.js'

const PAGE_SIZE = 50

const listQuerySchema = z.object({
  status: z.enum(['active', 'revoked']).optional(),
  page: adminPageQueryField,
})

const revokeSchema = z.object({
  confirmation: z.literal('REVOKE'),
  reason: z.string().max(500).optional(),
})

type PublicAdminApiKey = Omit<AdminApiKey, 'keyHash'>

function publicAdminApiKey(key: AdminApiKey): PublicAdminApiKey {
  const { keyHash: _keyHash, ...safe } = key
  return safe
}

/** Register admin API key management routes. */
export async function adminApiKeyRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get(
    '/api/admin/api-keys',
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
        store.listApiKeys(PAGE_SIZE, offset, status),
        store.countApiKeys(status),
      ])
      reply.status(200).send({ items: items.map(publicAdminApiKey), page, page_size: PAGE_SIZE, total })
    },
  )

  app.get(
    '/api/admin/api-keys/:id',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const key = await store.getApiKey(params.data.id)
      if (!key) {
        reply.status(404).send({ error: 'not_found' })
        return
      }
      const recentReports = await store.listReportsForApiKey(key.keyHash, 20)
      reply.status(200).send({ ...publicAdminApiKey(key), recent_reports: recentReports })
    },
  )

  app.post(
    '/api/admin/api-keys/:id/revoke',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamsSchema.safeParse(request.params)
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
      const actor = getRequestAdmin(request)
      const reason = await sanitizeOptionalAdminFreeText(store, body.data.reason)
      await store.revokeApiKeyWithAudit(key.id, {
        adminId: actor.id,
        action: 'revoke_key',
        targetId: key.id,
        targetKind: 'api_key',
        details: reason,
      })
      reply.status(200).send({ status: 'ok' })
    },
  )
}
