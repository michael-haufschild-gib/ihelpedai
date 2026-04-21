import { createHash, randomBytes } from 'node:crypto'

import bcrypt from 'bcrypt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { requireAdmin } from './middleware.js'

const BCRYPT_ROUNDS = 12

const inviteSchema = z.object({
  email: z.string().email().max(255),
})

const deactivateSchema = z.object({
  reason: z.string().max(500).optional(),
})

type AppInstance = FastifyInstance

/** Handler body for POST /api/admin/admins/invite — create admin + send invite; rollback on mail failure. */
async function handleInvite(app: AppInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const store = app.store
  const parsed = inviteSchema.safeParse(request.body)
  if (!parsed.success) { reply.status(400).send({ error: 'invalid_input' }); return }

  const existing = await store.getAdminByEmail(parsed.data.email)
  if (existing) {
    reply.status(409).send({ error: 'invalid_input', message: 'An admin with this email already exists.' })
    return
  }

  const tempPassword = randomBytes(32).toString('base64url')
  const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS)
  const admin = await store.insertAdmin(parsed.data.email, hash, request.admin!.id)
  await store.insertAuditEntry(request.admin!.id, 'create_admin', admin.id, 'admin', null)

  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const resetId = await store.insertPasswordReset(admin.id, tokenHash, expiresAt)

  const setupUrl = `${config.PUBLIC_URL}/admin/reset-password?token=${token}`
  try {
    await app.mailer.send({
      to: parsed.data.email,
      subject: 'ihelped.ai — Set your admin password',
      text: `You've been invited as an admin. Set your password: ${setupUrl}\n\nThis link expires in 24 hours.`,
    })
  } catch (err) {
    // Invite mail failed. Deactivate the stranded admin row and mark the
    // reset token used so neither can be abused; the inviter can retry.
    request.log.error({ err, adminId: admin.id }, 'invite: mail delivery failed')
    try {
      await store.updateAdminStatus(admin.id, 'deactivated')
      await store.markPasswordResetUsed(resetId)
    } catch (rollbackErr) {
      request.log.error({ err: rollbackErr, adminId: admin.id }, 'invite: rollback failed after mail error')
    }
    reply.status(502).send({ error: 'internal_error', message: 'Invite email could not be delivered. Try again.' })
    return
  }

  reply.status(201).send({ status: 'ok', id: admin.id })
}

/** Register admin account management routes. */
export async function adminAccountRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store

  app.get('/api/admin/admins', { preHandler: [requireAdmin] }, async (_request: FastifyRequest, reply: FastifyReply) => {
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
  })

  app.post('/api/admin/admins/invite', { preHandler: [requireAdmin] }, async (request, reply) => {
    await handleInvite(app, request, reply)
  })

  app.post('/api/admin/admins/:id/deactivate', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
    if (!params.success) {
      reply.status(404).send({ error: 'not_found' })
      return
    }

    if (params.data.id === request.admin!.id) {
      reply.status(400).send({ error: 'invalid_input', message: 'You cannot deactivate your own account.' })
      return
    }

    const target = await store.getAdmin(params.data.id)
    if (!target) {
      reply.status(404).send({ error: 'not_found' })
      return
    }

    const body = deactivateSchema.safeParse(request.body)
    await store.updateAdminStatus(target.id, 'deactivated')
    await store.deleteAdminSessions(target.id)
    await store.insertAuditEntry(
      request.admin!.id,
      'deactivate_admin',
      target.id,
      'admin',
      body.success ? (body.data.reason ?? null) : null,
    )

    reply.status(200).send({ status: 'ok' })
  })
}
