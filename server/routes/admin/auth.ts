import { createHash, randomBytes } from 'node:crypto'

import bcrypt from 'bcrypt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { requireAdmin, SESSION_COOKIE, sessionExpiry } from './middleware.js'

const BCRYPT_ROUNDS = 12
const LOGIN_THROTTLE_MAX = 5
const LOGIN_THROTTLE_WINDOW_S = 15 * 60
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000

const loginInput = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
})

const resetRequestInput = z.object({
  email: z.string().email().max(255),
})

const WEAK_PASSWORDS = new Set([
  'password1234', 'password12345', '123456789012',
  'qwertyuiopas', 'admin1234567', 'changeme1234',
])

const resetPasswordInput = z.object({
  token: z.string().min(1),
  password: z
    .string().min(12).max(255)
    .refine((v) => !WEAK_PASSWORDS.has(v.toLowerCase()), 'weak_password'),
  confirm_password: z.string().min(1),
})

const changePasswordInput = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string().min(12).max(255)
    .refine((v) => !WEAK_PASSWORDS.has(v.toLowerCase()), 'weak_password'),
})

/** Hash a string with SHA-256 using the server salt. */
function hashWithSalt(value: string): string {
  return createHash('sha256').update(`${config.IP_HASH_SALT}:${value}`).digest('hex')
}

/** Register login, logout, and session check routes. */
export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store
  const limiter = app.limiter

  app.post('/api/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginInput.safeParse(request.body)
    if (!parsed.success) { reply.status(400).send({ error: 'invalid_input' }); return }
    const ipHash = hashWithSalt(request.ip ?? 'unknown')
    const throttle = await limiter.check(`admin:login:${ipHash}`, LOGIN_THROTTLE_MAX, LOGIN_THROTTLE_WINDOW_S)
    if (!throttle.allowed) {
      reply.status(429).send({ error: 'rate_limited', message: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfter / 60)} minutes.`, retry_after_seconds: throttle.retryAfter })
      return
    }
    const admin = await store.getAdminByEmail(parsed.data.email)
    if (admin === null || admin.status !== 'active') {
      reply.status(401).send({ error: 'unauthorized', message: 'Email or password is incorrect.' }); return
    }
    const valid = await bcrypt.compare(parsed.data.password, admin.passwordHash)
    if (!valid) { reply.status(401).send({ error: 'unauthorized', message: 'Email or password is incorrect.' }); return }
    const sessionId = await store.insertSession(admin.id, sessionExpiry())
    await store.updateAdminLastLogin(admin.id)
    reply
      .setCookie(SESSION_COOKIE, sessionId, { path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', signed: true, maxAge: 14 * 24 * 60 * 60 })
      .status(200).send({ status: 'ok', admin: { id: admin.id, email: admin.email } })
  })

  app.post('/api/admin/logout', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = request.cookies[SESSION_COOKIE]
    if (typeof raw === 'string' && raw !== '') {
      const unsigned = request.unsignCookie(raw)
      if (unsigned.valid && typeof unsigned.value === 'string' && unsigned.value !== '') {
        await store.deleteSession(unsigned.value)
      }
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' }).status(200).send({ status: 'ok' })
  })

  app.get('/api/admin/me', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = request.admin!
    reply.status(200).send({ id: admin.id, email: admin.email, status: admin.status })
  })
}

/** Register password reset and change routes. */
export async function adminPasswordRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store
  const limiter = app.limiter

  app.post('/api/admin/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resetRequestInput.safeParse(request.body)
    if (!parsed.success) { reply.status(400).send({ error: 'invalid_input' }); return }
    const ipHash = hashWithSalt(request.ip ?? 'unknown')
    const throttle = await limiter.check(
      `admin:forgot-password:${ipHash}`,
      LOGIN_THROTTLE_MAX,
      LOGIN_THROTTLE_WINDOW_S,
    )
    // Always respond 200 so attackers cannot distinguish throttled from
    // fresh requests (no email-existence probe, no throttle probe).
    reply.status(200).send({ message: 'If an admin account exists for this email, a reset link has been sent.' })
    if (!throttle.allowed) {
      request.log.warn({ ipHash, retryAfter: throttle.retryAfter }, 'forgot-password throttled')
      return
    }
    try {
      const admin = await store.getAdminByEmail(parsed.data.email)
      if (admin === null || admin.status !== 'active') return
      const token = randomBytes(32).toString('base64url')
      const tokenHash = createHash('sha256').update(token).digest('hex')
      await store.insertPasswordReset(admin.id, tokenHash, new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString())
      await app.mailer.send({
        to: admin.email, subject: 'ihelped.ai — Password reset',
        text: `Reset your password: ${config.PUBLIC_URL}/admin/reset-password?token=${token}\n\nThis link expires in 1 hour.`,
      })
    } catch (err) {
      request.log.error({ err }, 'forgot-password: post-response work failed')
    }
  })

  app.post('/api/admin/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resetPasswordInput.safeParse(request.body)
    if (!parsed.success) { reply.status(400).send({ error: 'invalid_input', fields: parsed.error.flatten().fieldErrors }); return }
    if (parsed.data.password !== parsed.data.confirm_password) {
      reply.status(400).send({ error: 'invalid_input', fields: { confirm_password: 'passwords_must_match' } }); return
    }
    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
    const reset = await store.getPasswordResetByHash(tokenHash)
    if (reset === null) { reply.status(400).send({ error: 'invalid_input', message: 'This link has expired. Request a new one.' }); return }
    if (reset.used) { reply.status(400).send({ error: 'invalid_input', message: 'This link has already been used. Request a new one.' }); return }
    if (new Date(reset.expiresAt) < new Date()) { reply.status(400).send({ error: 'invalid_input', message: 'This link has expired. Request a new one.' }); return }
    await store.updateAdminPassword(reset.adminId, await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS))
    await store.markPasswordResetUsed(reset.id)
    await store.deleteAdminSessions(reset.adminId)
    await store.insertAuditEntry(reset.adminId, 'password_reset', reset.adminId, 'admin', null)
    reply.status(200).send({ message: 'Password updated. Log in with your new password.' })
  })

  app.post('/api/admin/change-password', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = changePasswordInput.safeParse(request.body)
    if (!parsed.success) { reply.status(400).send({ error: 'invalid_input', fields: parsed.error.flatten().fieldErrors }); return }
    const admin = request.admin!
    if (!(await bcrypt.compare(parsed.data.current_password, admin.passwordHash))) {
      reply.status(400).send({ error: 'invalid_input', fields: { current_password: 'incorrect' } }); return
    }
    await store.updateAdminPassword(admin.id, await bcrypt.hash(parsed.data.new_password, BCRYPT_ROUNDS))
    await store.insertAuditEntry(admin.id, 'password_change', admin.id, 'admin', null)
    reply.status(200).send({ status: 'ok' })
  })
}
