import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { requireAdmin } from './middleware.js'

const updateSettingSchema = z.object({
  key: z.enum(['auto_publish_agents', 'submission_freeze', 'sanitizer_exceptions']),
  value: z.string().max(10000),
})

/** Register admin settings routes. */
export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/settings', { preHandler: [requireAdmin] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const settings = await store.listSettings()
    const defaults: Record<string, string> = {
      auto_publish_agents: 'false',
      submission_freeze: 'false',
      sanitizer_exceptions: '',
    }
    const result: Record<string, string> = { ...defaults }
    for (const s of settings) {
      result[s.key] = s.value
    }
    reply.status(200).send(result)
  })

  app.put('/api/admin/settings', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = updateSettingSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    await store.setSetting(parsed.data.key, parsed.data.value)
    await store.insertAuditEntry(
      request.admin!.id,
      'update_setting',
      parsed.data.key,
      'setting',
      `Set to: ${parsed.data.value.slice(0, 100)}`,
    )
    reply.status(200).send({ status: 'ok' })
  })
}
