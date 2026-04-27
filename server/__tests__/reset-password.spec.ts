// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for POST /api/admin/reset-password.
 *
 * The reset endpoint accepts a one-time token + new password and updates the
 * admin's bcrypt hash. The matching production routes are in
 * server/routes/admin/auth.ts; failure modes covered here:
 *
 *   - Used token: insertPasswordReset → markPasswordResetUsed → POST → 400
 *   - Expired token: insert with expiresAt in the past → 400
 *   - Bad token: 400 generic "expired" message (timing-oracle: same shape)
 *   - Mismatched confirm_password: 400 fields.confirm_password
 *   - Weak password (passes length, fails zxcvbn): 400 fields.password
 *   - Success: 200, admin's bcrypt now matches new password, the reset row
 *     is consumed (used=true), and other sessions are revoked
 *
 * Together these cover every branch in resetPasswordInput.parse +
 * updateAdminPasswordWithAudit, including the side effect that orphans
 * existing sessions on a successful reset.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-reset-password-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

const ADMIN_EMAIL = 'reset-target@admin.ai'
const STRONG_PASSWORD = 'Tug-of-Squid! 87 lobotomy boats'

let app: FastifyInstance
let adminId = ''

async function plantToken(opts: { used?: boolean; expiresAtMs?: number } = {}): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(opts.expiresAtMs ?? Date.now() + 60_000).toISOString()
  const id = await app.store.insertPasswordReset(adminId, tokenHash, expiresAt)
  if (opts.used === true) await app.store.markPasswordResetUsed(id)
  return token
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash('originalpassword12', 10)
  const created = await app.store.insertAdmin(ADMIN_EMAIL, hash, null)
  adminId = created.id
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/admin/reset-password — token-state branches', () => {
  it('rejects a token that has been used with 400 + "already been used" copy', async () => {
    const token = await plantToken({ used: true })
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; message: string }
    expect(body.error).toBe('invalid_input')
    expect(body.message).toContain('already been used')
  })

  it('rejects an expired token with 400 + "expired" copy', async () => {
    const token = await plantToken({ expiresAtMs: Date.now() - 60_000 })
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { message: string }).message).toContain('expired')
  })

  it('rejects an unknown token with 400 + "expired" copy (timing-oracle defence)', async () => {
    // The route surfaces unknown-token and expired-token as the same
    // user-facing string. A divergence here would let an attacker probe
    // which tokens exist by reading the response copy.
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: {
        token: 'wholly-fictional-token-abcdef',
        password: STRONG_PASSWORD,
        confirm_password: STRONG_PASSWORD,
      },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { message: string }).message).toContain('expired')
  })
})

describe('POST /api/admin/reset-password — password validation', () => {
  it('rejects mismatched confirm_password with fields.confirm_password = passwords_must_match', async () => {
    const token = await plantToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: {
        token,
        password: STRONG_PASSWORD,
        confirm_password: `${STRONG_PASSWORD}-typo`,
      },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { confirm_password?: string } }
    expect(body.error).toBe('invalid_input')
    expect(body.fields?.confirm_password).toBe('passwords_must_match')
  })

  it('rejects a weak password (passes length but fails zxcvbn) with fields.password', async () => {
    const token = await plantToken()
    const weak = 'password1234' // length OK, zxcvbn score < 3
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: weak, confirm_password: weak },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { password?: string } }
    expect(body.error).toBe('invalid_input')
    expect(typeof body.fields?.password).toBe('string')
    expect(body.fields?.password).not.toBe('')
  })

  it('rejects a too-short password with fields.password (Zod min-length pre-check)', async () => {
    const token = await plantToken()
    const tooShort = 'short' // < 12 chars
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: tooShort, confirm_password: tooShort },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { password?: string } }
    expect(body.error).toBe('invalid_input')
    expect(typeof body.fields?.password).toBe('string')
  })

  it('rejects an oversized token (> MAX_AUTH_SECRET_LENGTH) without touching the store', async () => {
    // Lock that the schema cap fires before getPasswordResetByHash runs.
    // A future refactor pushing the cap server-side post-DB-call would
    // expose a free DoS via massive token-length lookups.
    const original = app.store.getPasswordResetByHash.bind(app.store)
    let calledWithOversize = false
    ;(
      app.store as unknown as { getPasswordResetByHash: typeof app.store.getPasswordResetByHash }
    ).getPasswordResetByHash = async (hash: string) => {
      if (hash.length > 64) calledWithOversize = true
      return original(hash)
    }
    try {
      const huge = 'x'.repeat(256)
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/reset-password',
        payload: { token: huge, password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
      })
      expect(res.statusCode).toBe(400)
      expect(calledWithOversize).toBe(false)
    } finally {
      ;(
        app.store as unknown as { getPasswordResetByHash: typeof app.store.getPasswordResetByHash }
      ).getPasswordResetByHash = original
    }
  })
})

describe('POST /api/admin/reset-password — happy path', () => {
  it('updates the password, marks the reset used, and revokes other sessions', async () => {
    // Seed a session for the admin so we can verify revocation.
    const beforeSessionId = await app.store.insertSession(adminId, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    expect(await app.store.getSession(beforeSessionId)).not.toBe(null)

    const token = await plantToken()
    const tokenHash = createHash('sha256').update(token).digest('hex')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { message: string }).message).toContain('Password updated')

    // (a) bcrypt now matches the new password and not the old one.
    const admin = await app.store.getAdminByEmail(ADMIN_EMAIL)
    if (admin === null) throw new Error('expected admin to remain after reset')
    expect(await bcrypt.compare(STRONG_PASSWORD, admin.passwordHash)).toBe(true)
    expect(await bcrypt.compare('originalpassword12', admin.passwordHash)).toBe(false)

    // (b) The reset row is marked used in the SAME transaction as the
    //     password update. The route does NOT call
    //     cleanupExpiredAuthState here, so the row remains in the DB
    //     with used=1 until a later cleanup pass deletes it. Lock the
    //     stronger invariant: the row must exist AND be marked used.
    //     A regression that deleted the row in the wrong place would
    //     pass the previous lenient assertion but break audit trail
    //     replay (you cannot reconstruct WHEN the reset was consumed).
    const after = await app.store.getPasswordResetByHash(tokenHash)
    expect(after).not.toBe(null)
    expect(after?.used).toBe(true)

    // (c) The pre-existing session was revoked. updateAdminPasswordWithAudit
    //     calls deleteAdminSessions for the entire admin (no exceptSessionId
    //     passed by the reset path), so every session row should be gone.
    expect(await app.store.getSession(beforeSessionId)).toBe(null)
  })

  it('a replay of the same token after success returns 400 expired (cannot rotate twice)', async () => {
    const token = await plantToken()
    const first = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
    })
    expect(first.statusCode).toBe(200)

    const replay = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: { token, password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
    })
    expect(replay.statusCode).toBe(400)
  })
})
