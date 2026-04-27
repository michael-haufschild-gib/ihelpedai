import { createHash, randomBytes } from 'node:crypto'

import bcrypt from 'bcrypt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { idParamsSchema } from './ids.js'
import { getRequestAdmin, requireAdmin } from './middleware.js'
import { sanitizeOptionalAdminFreeText } from './sanitize-admin-text.js'

const BCRYPT_ROUNDS = 12

/**
 * RFC 5321 caps the forward-path at 254 octets. Aligned with auth.ts
 * and api-keys.ts so the email-length contract is uniform across every
 * surface that accepts an address.
 */
const MAX_EMAIL_LENGTH = 254

const inviteSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
})

const deactivateSchema = z.object({
  reason: z.string().max(500).optional(),
})

type AppInstance = FastifyInstance

/** Handler body for POST /api/admin/admins/invite — create admin + send invite; rollback on mail failure. */
async function handleInvite(app: AppInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const store = app.store
  const parsed = inviteSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.status(400).send({ error: 'invalid_input' })
    return
  }

  const existing = await store.getAdminByEmail(parsed.data.email)
  if (existing) {
    reply.status(409).send({ error: 'invalid_input', message: 'An admin with this email already exists.' })
    return
  }

  const tempPassword = randomBytes(32).toString('base64url')
  const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS)
  const actor = getRequestAdmin(request)
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { admin, resetId } = await store.insertAdminInviteWithAudit(
    parsed.data.email,
    hash,
    actor.id,
    tokenHash,
    expiresAt,
  )

  const setupUrl = `${config.PUBLIC_URL}/admin/reset-password?token=${token}`
  try {
    await app.mailer.send({
      to: parsed.data.email,
      subject: 'ihelped.ai — Set your admin password',
      text: `You've been invited as an admin. Set your password: ${setupUrl}\n\nThis link expires in 24 hours.`,
    })
  } catch (err) {
    // Invite mail failed before the recipient saw the reset token. Remove
    // the invite rows so a transient SMTP outage does not permanently
    // consume that email address.
    request.log.error({ err, adminId: admin.id }, 'invite: mail delivery failed')
    try {
      await store.deleteFailedAdminInvite(admin.id, resetId)
    } catch (compensationErr) {
      request.log.error({ err: compensationErr, adminId: admin.id }, 'invite: compensation failed after mail error')
    }
    reply.status(502).send({ error: 'internal_error', message: 'Invite email could not be delivered. Try again.' })
    return
  }

  reply.status(201).send({ status: 'ok', id: admin.id })
}

/** Register admin account management routes. */
export async function adminAccountRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get(
    '/api/admin/admins',
    { preHandler: [requireAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const admins = await store.listAdmins()
      const safe = admins.map((a) => ({
        id: a.id,
        email: a.email,
        status: a.status,
        createdBy: a.createdBy,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
      }))
      reply.status(200).send({ items: safe })
    },
  )

  app.post('/api/admin/admins/invite', { preHandler: [requireAdmin] }, async (request, reply) => {
    await handleInvite(app, request, reply)
  })

  app.post(
    '/api/admin/admins/:id/deactivate',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success) {
        reply.status(404).send({ error: 'not_found' })
        return
      }

      const actor = getRequestAdmin(request)
      if (params.data.id === actor.id) {
        reply.status(400).send({ error: 'invalid_input', message: 'You cannot deactivate your own account.' })
        return
      }

      const target = await store.getAdmin(params.data.id)
      if (!target) {
        reply.status(404).send({ error: 'not_found' })
        return
      }

      const body = deactivateSchema.safeParse(request.body)
      if (!body.success) {
        reply.status(400).send({ error: 'invalid_input' })
        return
      }
      const reason = await sanitizeOptionalAdminFreeText(store, body.data.reason)
      await store.deactivateAdminWithAudit(target.id, {
        adminId: actor.id,
        action: 'deactivate_admin',
        targetId: target.id,
        targetKind: 'admin',
        details: reason,
      })

      reply.status(200).send({ status: 'ok' })
    },
  )
}
