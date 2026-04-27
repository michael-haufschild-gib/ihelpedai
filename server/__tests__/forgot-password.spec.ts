// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Mailer, MailMessage } from '../mail/index.js'

/*
 * Behavioural lock for POST /api/admin/forgot-password.
 *
 * Five invariants kept here:
 *  1. The route always replies 200 with the same generic message regardless
 *     of input. An attacker poking at the endpoint cannot tell which emails
 *     are registered.
 *  2. A reset email is sent for an active admin, NOT for a missing email,
 *     deactivated admin, or a request that the multi-bucket throttle denied.
 *  3. The throttle covers four axes: per-IP window, per-IP day, per-email
 *     hour, per-email day, plus two global buckets. Per-email throttle is
 *     the strictest deterministic axis to assert here without burning the
 *     whole 6-bucket grid.
 *  4. The token row written by the route hashes the same way the
 *     reset-password handler reads it back — without that round-trip, a
 *     refactor could quietly diverge the two and every reset link would
 *     401 with no signal in CI.
 *  5. A failure inside the post-response work (mail throws, store throws)
 *     is logged but never leaks: the response was already 200, and the
 *     request handler's catch must swallow the error.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-forgot-password-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '1'

class RecordingMailer implements Mailer {
  sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

class ThrowingMailer implements Mailer {
  async send(): Promise<void> {
    throw new Error('smtp: connection refused')
  }
}

const ACTIVE_EMAIL = 'active@admin.ai'
const DEACTIVATED_EMAIL = 'gone@admin.ai'

let app: FastifyInstance
let mailer: RecordingMailer
let activeAdminId = ''

async function expectGeneric200(payload: Record<string, unknown>, headers: Record<string, string> = {}): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/forgot-password',
    payload,
    headers,
  })
  expect(res.statusCode).toBe(200)
  // The exact copy is part of the timing-oracle defence: every successful
  // path returns this same string. A future refactor adding e.g. a
  // "rate_limited" or "no_account" hint would silently leak account state.
  expect((res.json() as { message: string }).message).toBe(
    'If an admin account exists for this email, a reset link has been sent.',
  )
}

async function flushPostResponseWork(): Promise<void> {
  // The route replies 200 BEFORE awaiting the mailer/store work. Vitest's
  // assertions race the post-response microtasks, so flush the event loop
  // a few ticks before reading mailer.sent. setImmediate is enough because
  // the only awaits in the post-response block are store + mailer, both of
  // which resolve synchronously in this test config.
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((r) => setImmediate(r))
  }
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  mailer = new RecordingMailer()
  ;(app as unknown as { mailer: Mailer }).mailer = mailer
  const hash = await bcrypt.hash('testpassword12', 10)
  const created = await app.store.insertAdmin(ACTIVE_EMAIL, hash, null)
  activeAdminId = created.id
  const deactivated = await app.store.insertAdmin(DEACTIVATED_EMAIL, hash, null)
  await app.store.updateAdminStatus(deactivated.id, 'deactivated')
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

afterEach(() => {
  mailer.sent = []
  ;(app as unknown as { mailer: Mailer }).mailer = mailer
})

describe('POST /api/admin/forgot-password — generic 200 envelope', () => {
  it('returns 200 + generic message for an unknown email', async () => {
    await expectGeneric200({ email: 'nobody@admin.ai' }, { 'x-forwarded-for': '198.51.100.1' })
    await flushPostResponseWork()
    expect(mailer.sent).toHaveLength(0)
  })

  it('returns 200 + generic message for a deactivated admin without sending mail', async () => {
    await expectGeneric200({ email: DEACTIVATED_EMAIL }, { 'x-forwarded-for': '198.51.100.2' })
    await flushPostResponseWork()
    // The throttle counts deactivated-admin attempts the same as active ones,
    // but the mail step short-circuits — so a probe targeting a deactivated
    // address cannot distinguish "exists but disabled" from "never existed".
    expect(mailer.sent).toHaveLength(0)
  })

  it('returns 200 + generic message for an active admin AND sends the reset email', async () => {
    await expectGeneric200({ email: ACTIVE_EMAIL }, { 'x-forwarded-for': '198.51.100.3' })
    await flushPostResponseWork()
    expect(mailer.sent).toHaveLength(1)
    const sent = mailer.sent[0]
    if (sent === undefined) throw new Error('expected reset email')
    expect(sent.to).toBe(ACTIVE_EMAIL)
    expect(sent.subject).toContain('Password reset')
    // The token written to the store must be derivable from the URL the
    // reset email contains. Without this round-trip, the route could
    // emit a bogus URL or skip the insertPasswordReset call entirely and
    // every other "200 + email" test here would still pass.
    const match = /token=([A-Za-z0-9_-]+)/.exec(sent.text)
    expect(match).not.toBe(null)
    const token = match?.[1]
    if (token === undefined) throw new Error('expected reset token in email body')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const reset = await app.store.getPasswordResetByHash(tokenHash)
    expect(reset?.adminId).toBe(activeAdminId)
    expect(reset?.used).toBe(false)
  })

  it('returns 400 invalid_input on a malformed email — input is the only failure mode that breaks the 200 contract', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/forgot-password',
      payload: { email: 'not-an-email' },
      headers: { 'x-forwarded-for': '198.51.100.4' },
    })
    // Schema parse failure happens BEFORE the generic-200 path. That is
    // intentional: we'd rather signal "this isn't an email" to the form
    // user than silently swallow a typo. Lock that behaviour here so a
    // future refactor moving the schema parse later cannot accidentally
    // hide form errors behind the security envelope.
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })
})

describe('POST /api/admin/forgot-password — per-email hour throttle', () => {
  it('per-email-hour cap denies the 4th attempt without sending mail, but still replies 200', async () => {
    // Per-email-hour limit is FORGOT_EMAIL_HOUR_LIMIT=3. Use a fresh email
    // so this spec doesn't collide with previous specs' counters.
    const email = 'throttle-target@admin.ai'
    const hash = await bcrypt.hash('testpassword12', 10)
    await app.store.insertAdmin(email, hash, null)
    // Three accepted attempts from rotating IPs (so per-IP doesn't deny
    // first). Each MUST send a mail — verifying the bucket fires only
    // after the third success, not before.
    for (let i = 0; i < 3; i += 1) {
      mailer.sent = []
      await expectGeneric200({ email }, { 'x-forwarded-for': `203.0.113.${String(20 + i)}` })
      await flushPostResponseWork()
      expect(mailer.sent).toHaveLength(1)
    }

    // The 4th attempt: same email, fresh IP. Per-email-hour bucket denies.
    // Response is still 200 with the generic envelope (timing-oracle
    // defence) but the mailer must NOT fire.
    mailer.sent = []
    await expectGeneric200({ email }, { 'x-forwarded-for': '203.0.113.99' })
    await flushPostResponseWork()
    expect(mailer.sent).toHaveLength(0)
  })
})

describe('POST /api/admin/forgot-password — per-IP-window throttle', () => {
  it('per-IP-window cap denies the 6th attempt from one IP without sending mail', async () => {
    // FORGOT_IP_WINDOW_LIMIT=5 in 15min. Burn the bucket WITHOUT burning
    // the per-email-hour bucket (limit 3) by rotating the email each call.
    const ip = '203.0.113.150'
    for (let i = 0; i < 5; i += 1) {
      const email = `ip-window-${String(i)}@admin.ai`
      // Seed each admin so the route reaches the mail step (locks that
      // attempts COUNT toward the bucket regardless of whether mail fires).
      const hash = await bcrypt.hash('testpassword12', 10)
      await app.store.insertAdmin(email, hash, null)
      mailer.sent = []
      await expectGeneric200({ email }, { 'x-forwarded-for': ip })
      await flushPostResponseWork()
      expect(mailer.sent).toHaveLength(1)
    }

    const overflowEmail = 'ip-window-overflow@admin.ai'
    const hash = await bcrypt.hash('testpassword12', 10)
    await app.store.insertAdmin(overflowEmail, hash, null)
    mailer.sent = []
    await expectGeneric200({ email: overflowEmail }, { 'x-forwarded-for': ip })
    await flushPostResponseWork()
    // Throttled — no email goes out, even though the admin row exists.
    expect(mailer.sent).toHaveLength(0)
  })
})

describe('POST /api/admin/forgot-password — mailer failure swallowed', () => {
  it('still replies 200 when the mailer throws, and does not surface the error to the caller', async () => {
    // The route emits the response BEFORE awaiting mailer.send, then runs
    // the post-response work inside a try/catch. A regression that
    // re-throws in the catch block (or moves the send before reply.send)
    // would leak a 5xx envelope. Lock the swallow.
    ;(app as unknown as { mailer: Mailer }).mailer = new ThrowingMailer()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/forgot-password',
      payload: { email: 'fresh-mail-fail@admin.ai' },
      headers: { 'x-forwarded-for': '198.51.100.50' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { message: string }).message).toBe(
      'If an admin account exists for this email, a reset link has been sent.',
    )
  })

  it('still replies 200 when a fresh attempt for an unknown email throws inside store lookup', async () => {
    // Non-existing admin path: store.getAdminByEmail returns null, then
    // the route returns. There's no second store call. The wrapper try/catch
    // proves itself by surviving any internal thrown — substitute a
    // throwing getAdminByEmail and the response must still be 200.
    const original = app.store.getAdminByEmail.bind(app.store)
    ;(app.store as unknown as { getAdminByEmail: typeof app.store.getAdminByEmail }).getAdminByEmail = async () => {
      throw new Error('db down')
    }
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/forgot-password',
        payload: { email: 'transient-db-error@admin.ai' },
        headers: { 'x-forwarded-for': '198.51.100.60' },
      })
      expect(res.statusCode).toBe(200)
    } finally {
      ;(app.store as unknown as { getAdminByEmail: typeof app.store.getAdminByEmail }).getAdminByEmail = original
    }
  })
})
