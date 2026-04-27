import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { parseSanitizerExceptionList } from '../../sanitizer/sanitize.js'
import { getRequestAdmin, requireAdmin } from './middleware.js'

const booleanSettingSchema = z.object({
  key: z.enum(['auto_publish_agents', 'submission_freeze']),
  value: z.enum(['true', 'false']),
})

const sanitizerSettingSchema = z.object({
  key: z.literal('sanitizer_exceptions'),
  value: z.string().max(10000),
})

const updateSettingSchema = z.discriminatedUnion('key', [booleanSettingSchema, sanitizerSettingSchema])

/** Build a non-sensitive audit detail for a setting update. */
function auditDetailsForSetting(key: string, value: string): string {
  if (key === 'sanitizer_exceptions') {
    const count = parseSanitizerExceptionList(value).length
    return `Updated sanitizer exception list (${count} ${count === 1 ? 'entry' : 'entries'})`
  }
  return `Set to: ${value.slice(0, 100)}`
}

/** Register admin settings routes. */
export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get(
    '/api/admin/settings',
    { preHandler: [requireAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const settings = await store.listSettings()
      const defaults: Record<string, string> = {
        auto_publish_agents: 'false',
        submission_freeze: 'false',
        sanitizer_exceptions: '',
      }
      const result: Record<string, string> = { ...defaults }
      for (const s of settings) {
        if (Object.prototype.hasOwnProperty.call(defaults, s.key)) result[s.key] = s.value
      }
      reply.status(200).send(result)
    },
  )

  app.put(
    '/api/admin/settings',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = updateSettingSchema.parse(request.body)
      const actor = getRequestAdmin(request)
      await store.setSettingWithAudit(parsed.key, parsed.value, {
        adminId: actor.id,
        action: 'update_setting',
        targetId: parsed.key,
        targetKind: 'setting',
        details: auditDetailsForSetting(parsed.key, parsed.value),
      })
      reply.status(200).send({ status: 'ok' })
    },
  )
}
