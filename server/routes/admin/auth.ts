import { createHash, randomBytes } from 'node:crypto'

import bcrypt from 'bcrypt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { hashWithSalt } from '../../lib/salted-hash.js'
import { zodFieldErrors } from '../../lib/zod-field-errors.js'
import type { BucketSpec } from '../../rate-limit/index.js'
import { isAcceptablePassword } from './password-strength.js'
import { getRequestAdmin, requireAdmin, SESSION_COOKIE, sessionExpiry } from './middleware.js'

const BCRYPT_ROUNDS = 12
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000
const MAX_AUTH_SECRET_LENGTH = 255

// Stable placeholder hash for failed logins. Running bcrypt.compare against
// this when no admin row exists (or the row is deactivated) keeps the
// response-time distribution identical to a valid-email-wrong-password case
// and closes the timing oracle that would otherwise enumerate admin emails.
// `$2b$12$` keeps the cost factor the same as BCRYPT_ROUNDS, so the CPU spend
// matches real hashes produced by bcrypt.hash(..., 12).
const DUMMY_BCRYPT_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.QvJpPQDKAT3fWXHhUMjFk5kUc8Pq'

// Multi-bucket rate limits. Each bucket caps one abuse vector: IP rotation,
// victim bombing, and global volume. If any bucket denies, the request is
// rejected with 429; for forgot-password the reply is 200 regardless so
// attackers cannot distinguish throttled from accepted.
const HOUR_S = 3600
const DAY_S = 24 * HOUR_S

const LOGIN_IP_WINDOW_LIMIT = 5
const LOGIN_IP_WINDOW_S = 15 * 60
const LOGIN_EMAIL_HOUR_LIMIT = 10
const LOGIN_EMAIL_DAY_LIMIT = 50
const LOGIN_GLOBAL_HOUR_LIMIT = 500

const FORGOT_IP_WINDOW_LIMIT = 5
const FORGOT_IP_WINDOW_S = 15 * 60
const FORGOT_IP_DAY_LIMIT = 20
const FORGOT_EMAIL_HOUR_LIMIT = 3
const FORGOT_EMAIL_DAY_LIMIT = 5
const FORGOT_GLOBAL_HOUR_LIMIT = 20
const FORGOT_GLOBAL_DAY_LIMIT = 50

/**
 * Multi-bucket rate-limit specs for a single login attempt. Per-IP caps the
 * common case; per-email defeats rotating-IP botnets targeting one admin;
 * global caps a full-on credential-stuffing wave.
 */
function loginThrottleBuckets(ipHash: string, emailHash: string): BucketSpec[] {
  return [
    { bucket: `admin:login:ip:${ipHash}:window`, limit: LOGIN_IP_WINDOW_LIMIT, windowSeconds: LOGIN_IP_WINDOW_S },
    { bucket: `admin:login:email:${emailHash}:hour`, limit: LOGIN_EMAIL_HOUR_LIMIT, windowSeconds: HOUR_S },
    { bucket: `admin:login:email:${emailHash}:day`, limit: LOGIN_EMAIL_DAY_LIMIT, windowSeconds: DAY_S },
    { bucket: 'admin:login:global:hour', limit: LOGIN_GLOBAL_HOUR_LIMIT, windowSeconds: HOUR_S },
  ]
}

/** Multi-bucket rate-limit specs for a single forgot-password request. */
function forgotPasswordBuckets(ipHash: string, emailHash: string): BucketSpec[] {
  return [
    {
      bucket: `admin:forgot-password:ip:${ipHash}:window`,
      limit: FORGOT_IP_WINDOW_LIMIT,
      windowSeconds: FORGOT_IP_WINDOW_S,
    },
    { bucket: `admin:forgot-password:ip:${ipHash}:day`, limit: FORGOT_IP_DAY_LIMIT, windowSeconds: DAY_S },
    { bucket: `admin:forgot-password:email:${emailHash}:hour`, limit: FORGOT_EMAIL_HOUR_LIMIT, windowSeconds: HOUR_S },
    { bucket: `admin:forgot-password:email:${emailHash}:day`, limit: FORGOT_EMAIL_DAY_LIMIT, windowSeconds: DAY_S },
    { bucket: 'admin:forgot-password:global:hour', limit: FORGOT_GLOBAL_HOUR_LIMIT, windowSeconds: HOUR_S },
    { bucket: 'admin:forgot-password:global:day', limit: FORGOT_GLOBAL_DAY_LIMIT, windowSeconds: DAY_S },
  ]
}

const loginInput = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
})

const resetRequestInput = z.object({
  email: z.string().email().max(255),
})

const resetPasswordInput = z.object({
  token: z.string().min(1).max(MAX_AUTH_SECRET_LENGTH),
  password: z
    .string()
    .min(12)
    .max(255)
    .refine((v) => isAcceptablePassword(v), 'weak_password'),
  confirm_password: z.string().min(1).max(MAX_AUTH_SECRET_LENGTH),
})

const changePasswordInput = z.object({
  current_password: z.string().min(1).max(MAX_AUTH_SECRET_LENGTH),
  new_password: z
    .string()
    .min(12)
    .max(255)
    .refine((v) => isAcceptablePassword(v), 'weak_password'),
})

/** Register login, logout, and session check routes. */
export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store
  const limiter = app.limiter

  app.post('/api/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginInput.safeParse(request.body)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const ipHash = hashWithSalt(request.ip ?? 'unknown')
    const emailHash = hashWithSalt(parsed.data.email.toLowerCase())
    const throttle = await limiter.checkAll(loginThrottleBuckets(ipHash, emailHash))
    if (!throttle.allowed) {
      reply
        .status(429)
        .send({
          error: 'rate_limited',
          message: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfter / 60)} minutes.`,
          retry_after_seconds: throttle.retryAfter,
        })
      return
    }
    const admin = await store.getAdminByEmail(parsed.data.email)
    // Run bcrypt unconditionally. When the admin is missing or deactivated we
    // hash against a stable placeholder so response-time analysis cannot
    // distinguish the three failure modes from each other.
    const targetHash = admin !== null && admin.status === 'active' ? admin.passwordHash : DUMMY_BCRYPT_HASH
    const passwordMatches = await bcrypt.compare(parsed.data.password, targetHash)
    if (admin === null || admin.status !== 'active' || !passwordMatches) {
      reply.status(401).send({ error: 'unauthorized', message: 'Email or password is incorrect.' })
      return
    }
    await store.cleanupExpiredAuthState()
    const sessionId = await store.insertSession(admin.id, sessionExpiry())
    await store.updateAdminLastLogin(admin.id)
    reply
      .setCookie(SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        signed: true,
        maxAge: 14 * 24 * 60 * 60,
      })
      .status(200)
      .send({ status: 'ok', admin: { id: admin.id, email: admin.email } })
  })

  app.post(
    '/api/admin/logout',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = request.cookies[SESSION_COOKIE]
      if (typeof raw === 'string' && raw !== '') {
        const unsigned = request.unsignCookie(raw)
        if (unsigned.valid && typeof unsigned.value === 'string' && unsigned.value !== '') {
          await store.deleteSession(unsigned.value)
        }
      }
      reply.clearCookie(SESSION_COOKIE, { path: '/' }).status(200).send({ status: 'ok' })
    },
  )

  app.get('/api/admin/me', { preHandler: [requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = getRequestAdmin(request)
    reply.status(200).send({ id: admin.id, email: admin.email, status: admin.status })
  })
}

/** Register password reset and change routes. */
export async function adminPasswordRoutes(app: FastifyInstance): Promise<void> {
  const store = app.store
  const limiter = app.limiter

  app.post('/api/admin/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resetRequestInput.safeParse(request.body)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input' })
      return
    }
    const ipHash = hashWithSalt(request.ip ?? 'unknown')
    const emailHash = hashWithSalt(parsed.data.email.toLowerCase())
    const throttle = await limiter.checkAll(forgotPasswordBuckets(ipHash, emailHash))
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
      await store.cleanupExpiredAuthState()
      await store.insertPasswordReset(admin.id, tokenHash, new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString())
      await app.mailer.send({
        to: admin.email,
        subject: 'ihelped.ai — Password reset',
        text: `Reset your password: ${config.PUBLIC_URL}/admin/reset-password?token=${token}\n\nThis link expires in 1 hour.`,
      })
    } catch (err) {
      request.log.error({ err }, 'forgot-password: post-response work failed')
    }
  })

  app.post('/api/admin/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resetPasswordInput.safeParse(request.body)
    if (!parsed.success) {
      reply.status(400).send({ error: 'invalid_input', fields: zodFieldErrors(parsed.error) })
      return
    }
    if (parsed.data.password !== parsed.data.confirm_password) {
      reply.status(400).send({ error: 'invalid_input', fields: { confirm_password: 'passwords_must_match' } })
      return
    }
    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
    const reset = await store.getPasswordResetByHash(tokenHash)
    if (reset === null) {
      reply.status(400).send({ error: 'invalid_input', message: 'This link has expired. Request a new one.' })
      return
    }
    if (reset.used) {
      reply.status(400).send({ error: 'invalid_input', message: 'This link has already been used. Request a new one.' })
      return
    }
    if (new Date(reset.expiresAt) < new Date()) {
      reply.status(400).send({ error: 'invalid_input', message: 'This link has expired. Request a new one.' })
      return
    }
    await store.updateAdminPasswordWithAudit(
      reset.adminId,
      await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
      {
        adminId: reset.adminId,
        action: 'password_reset',
        targetId: reset.adminId,
        targetKind: 'admin',
        details: null,
      },
      { resetId: reset.id },
    )
    reply.status(200).send({ message: 'Password updated. Log in with your new password.' })
  })

  app.post(
    '/api/admin/change-password',
    { preHandler: [requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = changePasswordInput.safeParse(request.body)
      if (!parsed.success) {
        reply.status(400).send({ error: 'invalid_input', fields: zodFieldErrors(parsed.error) })
        return
      }
      const admin = getRequestAdmin(request)
      if (!(await bcrypt.compare(parsed.data.current_password, admin.passwordHash))) {
        reply.status(400).send({ error: 'invalid_input', fields: { current_password: 'incorrect' } })
        return
      }
      const currentSessionId = request.unsignCookie(request.cookies[SESSION_COOKIE] ?? '').value ?? undefined
      await store.updateAdminPasswordWithAudit(
        admin.id,
        await bcrypt.hash(parsed.data.new_password, BCRYPT_ROUNDS),
        {
          adminId: admin.id,
          action: 'password_change',
          targetId: admin.id,
          targetKind: 'admin',
          details: null,
        },
        { exceptSessionId: currentSessionId },
      )
      reply.status(200).send({ status: 'ok' })
    },
  )
}
