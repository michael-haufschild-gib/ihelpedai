import { createHash, randomBytes } from 'node:crypto'

import bcrypt from 'bcrypt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { byteLength } from '../../lib/byte-length.js'
import { effectiveLimit } from '../../lib/effective-limit.js'
import { hashWithSalt } from '../../lib/salted-hash.js'
import { zodFieldErrors } from '../../lib/zod-field-errors.js'
import type { BucketSpec } from '../../rate-limit/index.js'
import { isAcceptablePassword } from './password-strength.js'
import { getRequestAdmin, requireAdmin, SESSION_COOKIE, sessionExpiry } from './middleware.js'

const BCRYPT_ROUNDS = 12
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000
/**
 * Bounds on auth-related secrets, applied at the schema layer so the
 * server can reject pathological inputs before any cryptographic work
 * (bcrypt hashing, sha256 token lookup) happens.
 *
 *  - `MAX_LOGIN_PASSWORD_LENGTH` stays loose at 255 chars because bcrypt
 *    silently truncates input to 72 BYTES; an existing admin whose
 *    password happens to span more than 72 bytes still authenticates
 *    today, and tightening login-side would lock them out without a
 *    migration path. Validation of the truncation contract happens on
 *    the new-password side instead.
 *  - `MAX_NEW_PASSWORD_BYTES` mirrors bcrypt's actual input window so a
 *    user setting a fresh password gets the entropy they paid for.
 *  - `MAX_RESET_TOKEN_LENGTH` is 64 chars: tokens are server-generated
 *    as 32-byte base64url (43 chars), so 64 is comfortable headroom
 *    while still rejecting absurd inputs before the sha256 lookup.
 *  - `MAX_EMAIL_LENGTH` is 254, the RFC 5321 ceiling for a forward path.
 */
const MAX_LOGIN_PASSWORD_LENGTH = 255
const MAX_NEW_PASSWORD_BYTES = 72
const MAX_RESET_TOKEN_LENGTH = 64
const MAX_EMAIL_LENGTH = 254

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
  // Each cap is wrapped in `effectiveLimit()` so dev/CI can run the e2e
  // suite repeatedly without locking themselves out of the admin login
  // path while production keeps the raw values. The dev multiplier is
  // capped at 1 by the test specs, so existing behavioural locks (e.g.
  // 5 attempts succeed; 6th 429s) hold under tests.
  return [
    {
      bucket: `admin:login:ip:${ipHash}:window`,
      limit: effectiveLimit(LOGIN_IP_WINDOW_LIMIT),
      windowSeconds: LOGIN_IP_WINDOW_S,
    },
    {
      bucket: `admin:login:email:${emailHash}:hour`,
      limit: effectiveLimit(LOGIN_EMAIL_HOUR_LIMIT),
      windowSeconds: HOUR_S,
    },
    {
      bucket: `admin:login:email:${emailHash}:day`,
      limit: effectiveLimit(LOGIN_EMAIL_DAY_LIMIT),
      windowSeconds: DAY_S,
    },
    {
      bucket: 'admin:login:global:hour',
      limit: effectiveLimit(LOGIN_GLOBAL_HOUR_LIMIT),
      windowSeconds: HOUR_S,
    },
  ]
}

/**
 * Multi-bucket rate-limit specs for a single forgot-password request.
 * Caps scale via `effectiveLimit()`: see the rationale on
 * `loginThrottleBuckets`.
 */
function forgotPasswordBuckets(ipHash: string, emailHash: string): BucketSpec[] {
  return [
    {
      bucket: `admin:forgot-password:ip:${ipHash}:window`,
      limit: effectiveLimit(FORGOT_IP_WINDOW_LIMIT),
      windowSeconds: FORGOT_IP_WINDOW_S,
    },
    {
      bucket: `admin:forgot-password:ip:${ipHash}:day`,
      limit: effectiveLimit(FORGOT_IP_DAY_LIMIT),
      windowSeconds: DAY_S,
    },
    {
      bucket: `admin:forgot-password:email:${emailHash}:hour`,
      limit: effectiveLimit(FORGOT_EMAIL_HOUR_LIMIT),
      windowSeconds: HOUR_S,
    },
    {
      bucket: `admin:forgot-password:email:${emailHash}:day`,
      limit: effectiveLimit(FORGOT_EMAIL_DAY_LIMIT),
      windowSeconds: DAY_S,
    },
    {
      bucket: 'admin:forgot-password:global:hour',
      limit: effectiveLimit(FORGOT_GLOBAL_HOUR_LIMIT),
      windowSeconds: HOUR_S,
    },
    {
      bucket: 'admin:forgot-password:global:day',
      limit: effectiveLimit(FORGOT_GLOBAL_DAY_LIMIT),
      windowSeconds: DAY_S,
    },
  ]
}

/**
 * Reject a fresh password that exceeds bcrypt's effective input window.
 * bcrypt silently truncates input beyond 72 BYTES, so anything submitted
 * past that point contributes no entropy — the user thinks they have a
 * stronger password than they do. Surface this as `too_long` at the
 * schema layer instead.
 */
const newPasswordSchema = z
  .string()
  .min(12)
  .refine((v) => byteLength(v) <= MAX_NEW_PASSWORD_BYTES, 'too_long')
  .refine((v) => isAcceptablePassword(v), 'weak_password')

// `confirm_password` carries the same bcrypt 72-byte ceiling as
// `password` (without the strength check, which is redundant once the
// equality check passes). Capping it at the reset-token length would
// false-reject a legitimate 65–72 byte new password whose `password`
// field passed validation.
const confirmPasswordSchema = z
  .string()
  .min(1)
  .refine((v) => byteLength(v) <= MAX_NEW_PASSWORD_BYTES, 'too_long')

const loginInput = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  // Loose 255 cap on login matches what bcrypt was already accepting.
  // Tightening to 72 BYTES would lock out any existing admin whose
  // password happens to span more — bcrypt was always truncating their
  // input to 72 silently and they were authenticating fine. The
  // entropy-window enforcement happens on the new-password side, where
  // it does no harm.
  password: z.string().min(1).max(MAX_LOGIN_PASSWORD_LENGTH),
})

const resetRequestInput = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
})

const resetPasswordInput = z.object({
  token: z.string().min(1).max(MAX_RESET_TOKEN_LENGTH),
  password: newPasswordSchema,
  confirm_password: confirmPasswordSchema,
})

const changePasswordInput = z.object({
  // Existing-password check runs against the stored bcrypt hash, so the
  // 255 cap matches `loginInput.password` for the same reason.
  current_password: z.string().min(1).max(MAX_LOGIN_PASSWORD_LENGTH),
  new_password: newPasswordSchema,
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
      reply.status(429).send({
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
      .send({ status: 'ok', admin: { id: admin.id, email: admin.email, status: admin.status } })
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

async function handleForgotPassword(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = resetRequestInput.safeParse(request.body)
  if (!parsed.success) {
    reply.status(400).send({ error: 'invalid_input' })
    return
  }
  const ipHash = hashWithSalt(request.ip ?? 'unknown')
  const emailHash = hashWithSalt(parsed.data.email.toLowerCase())
  const throttle = await app.limiter.checkAll(forgotPasswordBuckets(ipHash, emailHash))
  // Always respond 200 so attackers cannot distinguish throttled from fresh
  // requests (no email-existence probe, no throttle probe).
  reply.status(200).send({ message: 'If an admin account exists for this email, a reset link has been sent.' })
  if (!throttle.allowed) {
    request.log.warn({ ipHash, retryAfter: throttle.retryAfter }, 'forgot-password throttled')
    return
  }
  try {
    const admin = await app.store.getAdminByEmail(parsed.data.email)
    if (admin === null || admin.status !== 'active') return
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await app.store.cleanupExpiredAuthState()
    await app.store.insertPasswordReset(admin.id, tokenHash, new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString())
    await app.mailer.send({
      to: admin.email,
      subject: 'ihelped.ai — Password reset',
      text: `Reset your password: ${config.PUBLIC_URL}/admin/reset-password?token=${token}\n\nThis link expires in 1 hour.`,
    })
  } catch (err) {
    request.log.error({ err }, 'forgot-password: post-response work failed')
  }
}

async function handleResetPassword(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
  const reset = await app.store.getPasswordResetByHash(tokenHash)
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
  await app.store.updateAdminPasswordWithAudit(
    reset.adminId,
    await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
    { adminId: reset.adminId, action: 'password_reset', targetId: reset.adminId, targetKind: 'admin', details: null },
    { resetId: reset.id },
  )
  reply.status(200).send({ message: 'Password updated. Log in with your new password.' })
}

async function handleChangePassword(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
  await app.store.updateAdminPasswordWithAudit(
    admin.id,
    await bcrypt.hash(parsed.data.new_password, BCRYPT_ROUNDS),
    { adminId: admin.id, action: 'password_change', targetId: admin.id, targetKind: 'admin', details: null },
    { exceptSessionId: currentSessionId },
  )
  reply.status(200).send({ status: 'ok' })
}

/** Register password reset and change routes. */
export async function adminPasswordRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/forgot-password', (request, reply) => handleForgotPassword(app, request, reply))
  app.post('/api/admin/reset-password', (request, reply) => handleResetPassword(app, request, reply))
  app.post('/api/admin/change-password', { preHandler: [requireAdmin] }, (request, reply) =>
    handleChangePassword(app, request, reply),
  )
}
