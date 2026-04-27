// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for the SESSION_ABSOLUTE_MAX_MS guard in
 * server/routes/admin/middleware.ts.
 *
 * The middleware enforces TWO time bounds on a session cookie:
 *   1. Idle window (`expires_at`) — slid forward by touchSession on each
 *      request. Already exercised by admin-auth.spec.
 *   2. Absolute age (`createdAt` + 30 days) — NOT slid by activity. A
 *      session older than 30 days fails 401 even if expires_at is fresh.
 *      Untested elsewhere.
 *
 * The absolute cap defends against stolen cookies that stay active
 * forever via continuous use. Without this guard, a long-lived stolen
 * session would be valid until the user manually logged it out — which
 * never happens.
 *
 * Three cases lock the guard:
 *  - A session whose createdAt is > 30 days old → 401, row deleted
 *  - A session whose createdAt parses to NaN (corrupt timestamp) → 401, row deleted
 *  - A session whose createdAt is in the FUTURE (negative age) → 401, row deleted
 *
 * The cookie itself signs the SESSION ID, not its age. So we plant an
 * old/corrupt row directly via the store, sign a cookie with the test
 * app's secret, and observe the gate.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-session-age-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

const DAY_MS = 24 * 60 * 60 * 1000

let app: FastifyInstance
let adminId = ''

interface DbHandle {
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
  }
}

function getDb(): DbHandle {
  return (app.store as unknown as { db: DbHandle }).db
}

/** Plant a session row with custom createdAt. expiresAt is set far in the
 * future so the 14-day idle gate cannot deny — the absolute cap is the
 * only failure mode under test. */
function plantSession(sessionId: string, createdAt: string, expiresAtMs = Date.now() + 14 * DAY_MS): void {
  const expiresAt = new Date(expiresAtMs).toISOString()
  // The schema column `created_at` has a default of strftime(now); the
  // row insert in the store doesn't pass created_at, so we override it
  // here via direct SQL to plant the deliberate value.
  getDb()
    .prepare('INSERT INTO admin_sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, adminId, expiresAt, createdAt)
}

function sessionExists(sessionId: string): boolean {
  const row = getDb().prepare('SELECT id FROM admin_sessions WHERE id = ?').get(sessionId) as { id: string } | undefined
  return row !== undefined
}

function signedCookieFor(sessionId: string): string {
  return `admin_session=${app.signCookie(sessionId)}`
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  const admin = await app.store.insertAdmin('age-cap@admin.ai', hash, null)
  adminId = admin.id
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('SESSION_ABSOLUTE_MAX_MS guard — age cap', () => {
  it('a session exactly within the 30-day window still authenticates', async () => {
    // 29 days old: under the 30-day cap. Must still authenticate.
    const sessionId = 'sess29days0'
    const createdAt = new Date(Date.now() - 29 * DAY_MS).toISOString()
    plantSession(sessionId, createdAt)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: signedCookieFor(sessionId) },
    })
    expect(res.statusCode).toBe(200)
    // Row remains.
    expect(sessionExists(sessionId)).toBe(true)
  })

  it('a session past the 30-day cap returns 401 AND deletes the row', async () => {
    const sessionId = 'sess31days0'
    const createdAt = new Date(Date.now() - 31 * DAY_MS).toISOString()
    plantSession(sessionId, createdAt)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: signedCookieFor(sessionId) },
    })
    expect(res.statusCode).toBe(401)
    // The middleware deletes the offending row on its way out, so a
    // replay (even with a clock-rewind on the server) cannot resurrect
    // the session. This is the part that fails closed.
    expect(sessionExists(sessionId)).toBe(false)
  })

  it('a session with a corrupt (unparseable) createdAt returns 401 AND deletes the row', async () => {
    const sessionId = 'sesscorrupt'
    plantSession(sessionId, 'this-is-not-a-date')

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: signedCookieFor(sessionId) },
    })
    expect(res.statusCode).toBe(401)
    expect(sessionExists(sessionId)).toBe(false)
  })

  it('a session whose createdAt is in the FUTURE returns 401 AND deletes the row', async () => {
    // Negative session age: clock skew on the storing host or a malicious
    // backdated row. Either way, fail closed.
    const sessionId = 'sessfuture0'
    plantSession(sessionId, new Date(Date.now() + 60 * DAY_MS).toISOString())

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: signedCookieFor(sessionId) },
    })
    expect(res.statusCode).toBe(401)
    expect(sessionExists(sessionId)).toBe(false)
  })
})

describe('SESSION sliding idle window — touchSession on every request', () => {
  it('extends expires_at on each authenticated request (sliding idle window)', async () => {
    // requireAdmin calls touchSession(sessionId, sessionExpiry()) on
    // every successful authenticate, sliding the 14-day idle window
    // forward. Without this, a user who logged in 14 days ago and then
    // started actively using the admin would be kicked out at the
    // hard expiry; with the slide, their session stays alive as long
    // as they keep using it (subject to the 30-day absolute cap above).
    const sessionId = 'sliding00'
    // Plant with a near-expiry expires_at and a fresh createdAt so the
    // absolute cap doesn't fire.
    const closeToExpiry = new Date(Date.now() + 60_000).toISOString()
    getDb()
      .prepare('INSERT INTO admin_sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, adminId, closeToExpiry, new Date().toISOString())

    const beforeRow = getDb().prepare('SELECT expires_at FROM admin_sessions WHERE id = ?').get(sessionId) as {
      expires_at: string
    }
    const beforeMs = new Date(beforeRow.expires_at).getTime()

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: signedCookieFor(sessionId) },
    })
    expect(res.statusCode).toBe(200)

    const afterRow = getDb().prepare('SELECT expires_at FROM admin_sessions WHERE id = ?').get(sessionId) as {
      expires_at: string
    }
    const afterMs = new Date(afterRow.expires_at).getTime()
    // Anything bigger than the pre-touch value confirms a touch happened.
    expect(afterMs).toBeGreaterThan(beforeMs)
    // Sanity: the new expiry is within ~14 days of now (sessionExpiry()
    // returns Date.now() + 14d). 60s tolerance for clock drift across
    // route + assertion.
    const fourteenDaysFromNow = Date.now() + 14 * DAY_MS
    expect(Math.abs(afterMs - fourteenDaysFromNow)).toBeLessThan(60_000)
  })
})

describe('admin session cookie — security attributes', () => {
  it('sets httpOnly + sameSite=Lax + signed on a successful login', async () => {
    // Without httpOnly, an XSS bug elsewhere on the page would let
    // document.cookie steal the session. Without sameSite=Lax (or stricter),
    // a third-party site could mount a CSRF GET that submits the cookie.
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'age-cap@admin.ai', password: 'testpassword12' },
      headers: { 'x-forwarded-for': '203.0.113.230' },
    })
    expect(res.statusCode).toBe(200)
    const raw = res.headers['set-cookie']
    const cookieHeader = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
    expect(cookieHeader).toMatch(/admin_session=/i)
    expect(cookieHeader).toMatch(/HttpOnly/i)
    // SameSite must be Lax (allows top-level GET nav, blocks cross-site
    // POST). Strict would break the login redirect; None would be CSRF
    // bait. Lock to Lax.
    expect(cookieHeader).toMatch(/SameSite=Lax/i)
    // The cookie value must be signed — the dot separator marks a
    // signed cookie; an unsigned cookie has just the raw session id.
    const valuePart = /admin_session=([^;]+)/.exec(cookieHeader)?.[1] ?? ''
    expect(valuePart).toContain('.')
  })

  it('does NOT set the Secure flag in NODE_ENV=test (set in production only)', async () => {
    // The cookie's secure flag depends on NODE_ENV, not on the request.
    // Tests run under NODE_ENV=test, so secure should be off; the
    // production path is locked by the conditional in adminAuthRoutes
    // (and test coverage of that branch comes from a config-validation
    // smoke test, not from booting fastify under NODE_ENV=production).
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'age-cap@admin.ai', password: 'testpassword12' },
      headers: { 'x-forwarded-for': '203.0.113.231' },
    })
    expect(res.statusCode).toBe(200)
    const raw = res.headers['set-cookie']
    const cookieHeader = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
    // Secure flag MUST be absent in test/dev; otherwise local development
    // over plain http breaks the login flow with no signal.
    expect(cookieHeader).not.toMatch(/;\s*Secure(\b|;)/i)
  })

  it('clears the cookie on logout with an immediate-expiry header', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'age-cap@admin.ai', password: 'testpassword12' },
      headers: { 'x-forwarded-for': '203.0.113.232' },
    })
    expect(login.statusCode).toBe(200)
    const loginCookie =
      typeof login.headers['set-cookie'] === 'string'
        ? login.headers['set-cookie']
        : ((login.headers['set-cookie'] as string[])[0] ?? '')

    const logout = await app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { cookie: loginCookie },
    })
    expect(logout.statusCode).toBe(200)
    const clearedRaw = logout.headers['set-cookie']
    const cleared = typeof clearedRaw === 'string' ? clearedRaw : ((clearedRaw as string[])[0] ?? '')
    // Fastify's clearCookie issues a Set-Cookie with an Expires in the past
    // (or Max-Age=0). Either form is acceptable; both signal the browser
    // to drop the cookie immediately.
    expect(cleared.toLowerCase()).toMatch(/expires=|max-age=0/i)
  })
})
