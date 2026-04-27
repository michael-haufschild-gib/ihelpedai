// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for POST /api/admin/change-password.
 *
 * Differs from /reset-password in two ways:
 *  - Authenticated. requireAdmin gates it; the current session cookie is the
 *    proof of identity, not a token.
 *  - Other-session revocation. updateAdminPasswordWithAudit is called with
 *    `exceptSessionId` = current session id, so a successful change leaves
 *    the actor still logged in but kills every other open session for the
 *    same admin. This is the lock here that nothing else covers.
 *
 * Cases:
 *  - Wrong current_password → 400 fields.current_password = 'incorrect'
 *  - Weak new_password → 400 fields.password (zxcvbn)
 *  - Too-short new_password → 400 fields.password (Zod min)
 *  - Happy path: password rotated, current session preserved, others revoked
 *  - Replay with the OLD password fails after rotation (locks the round-trip)
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-change-password-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

const ADMIN_EMAIL = 'change-target@admin.ai'
const CURRENT_PASSWORD = 'originalpassword12'
const NEW_PASSWORD = 'Tug-of-Squid! 87 lobotomy boats'

let app: FastifyInstance

// The login throttle (per-IP-window=5/15min) does NOT scale with
// DEV_RATE_MULTIPLIER, so each call must rotate the simulated peer IP
// through x-forwarded-for or the spec will deny itself across tests.
let nextIpOctet = 10
function freshLoginIp(): string {
  nextIpOctet += 1
  return `198.51.100.${String(nextIpOctet)}`
}

async function loginAndGetCookie(
  opts: {
    email?: string
    password?: string
    ip?: string
  } = {},
): Promise<string> {
  const email = opts.email ?? ADMIN_EMAIL
  const password = opts.password ?? CURRENT_PASSWORD
  const ip = opts.ip ?? freshLoginIp()
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email, password },
    headers: { 'x-forwarded-for': ip },
  })
  if (res.statusCode !== 200) {
    throw new Error(`expected login 200, got ${String(res.statusCode)} body=${JSON.stringify(res.json())}`)
  }
  const raw = res.headers['set-cookie']
  const cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  if (cookie === '') throw new Error('expected login cookie')
  return cookie
}

async function changeAdminPasswordTo(target: string): Promise<void> {
  // Reset the seeded admin's bcrypt back to CURRENT_PASSWORD so each spec
  // starts from a known state. Tests may rotate the password mid-flight.
  const hash = await bcrypt.hash(target, 10)
  const admin = await app.store.getAdminByEmail(ADMIN_EMAIL)
  if (admin === null) throw new Error('expected seeded admin')
  await app.store.updateAdminPassword(admin.id, hash)
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash(CURRENT_PASSWORD, 10)
  await app.store.insertAdmin(ADMIN_EMAIL, hash, null)
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/admin/change-password — validation branches', () => {
  it('rejects wrong current_password with fields.current_password = incorrect', async () => {
    await changeAdminPasswordTo(CURRENT_PASSWORD)
    const cookie = await loginAndGetCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie },
      payload: { current_password: 'wrongguess123', new_password: NEW_PASSWORD },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { current_password?: string } }
    expect(body.error).toBe('invalid_input')
    expect(body.fields?.current_password).toBe('incorrect')
  })

  it('rejects a weak new_password (passes length, fails zxcvbn) with fields.new_password', async () => {
    await changeAdminPasswordTo(CURRENT_PASSWORD)
    const cookie = await loginAndGetCookie()
    const weak = 'password1234'
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie },
      payload: { current_password: CURRENT_PASSWORD, new_password: weak },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { new_password?: string } }
    expect(body.error).toBe('invalid_input')
    expect(typeof body.fields?.new_password).toBe('string')
    expect(body.fields?.new_password).not.toBe('')
  })

  it('rejects a too-short new_password (Zod min)', async () => {
    await changeAdminPasswordTo(CURRENT_PASSWORD)
    const cookie = await loginAndGetCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie },
      payload: { current_password: CURRENT_PASSWORD, new_password: 'short' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { new_password?: string } }
    expect(body.error).toBe('invalid_input')
    expect(typeof body.fields?.new_password).toBe('string')
  })

  it('returns 401 without a session cookie (requireAdmin gate)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      payload: { current_password: CURRENT_PASSWORD, new_password: NEW_PASSWORD },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/admin/change-password — happy path session contract', () => {
  it('rotates the password, kills sibling sessions, keeps the actor session live', async () => {
    await changeAdminPasswordTo(CURRENT_PASSWORD)

    // Two separate logins → two separate session ids. After the change,
    // the request that issued the change must still authenticate (so the
    // admin doesn't get logged out of their own action) while the sibling
    // session must be revoked. This is what makes the change-password flow
    // safer than reset-password — reset destroys every session.
    const sessionA = await loginAndGetCookie()
    const sessionB = await loginAndGetCookie()
    expect(sessionA).not.toBe(sessionB)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie: sessionA },
      payload: { current_password: CURRENT_PASSWORD, new_password: NEW_PASSWORD },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { status: string }).status).toBe('ok')

    // sessionA — the cookie used to issue the change — must still authenticate.
    const meA = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: sessionA },
    })
    expect(meA.statusCode).toBe(200)

    // sessionB — every other session for the same admin — must be 401.
    const meB = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: sessionB },
    })
    expect(meB.statusCode).toBe(401)

    // Old password no longer works on a fresh login. Rotate the IP so
    // the per-IP-window throttle does not deny the probe before bcrypt
    // gets a chance to reject.
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: ADMIN_EMAIL, password: CURRENT_PASSWORD },
      headers: { 'x-forwarded-for': freshLoginIp() },
    })
    expect(oldLogin.statusCode).toBe(401)

    // New password does.
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: ADMIN_EMAIL, password: NEW_PASSWORD },
      headers: { 'x-forwarded-for': freshLoginIp() },
    })
    expect(newLogin.statusCode).toBe(200)
  })

  it('an audit row is recorded for password_change with the actor as adminId', async () => {
    await changeAdminPasswordTo(CURRENT_PASSWORD)
    const cookie = await loginAndGetCookie()

    const beforeAudits = await app.store.listAuditLog(50, 0, { action: 'password_change' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie },
      payload: { current_password: CURRENT_PASSWORD, new_password: NEW_PASSWORD },
    })
    expect(res.statusCode).toBe(200)

    const afterAudits = await app.store.listAuditLog(50, 0, { action: 'password_change' })
    // At least one new password_change row must exist whose target_id and
    // admin_id both equal the actor admin id (self-target). Without this
    // assertion, a refactor that called updateAdminPassword instead of
    // updateAdminPasswordWithAudit would silently drop the audit trail.
    expect(afterAudits.length).toBe(beforeAudits.length + 1)
    const latest = afterAudits[0]
    if (latest === undefined) throw new Error('expected audit entry')
    expect(latest.action).toBe('password_change')
    expect(latest.adminId).not.toBe(null)
    expect(latest.targetId).toBe(latest.adminId)
  })
})
