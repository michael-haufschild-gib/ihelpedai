// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Mailer, MailMessage } from '../mail/index.js'

/*
 * Behavioural lock for the multi-bucket /api/api-keys/issue throttle.
 *
 * api-key-issue.spec covers the happy path + the mail-failure rollback;
 * neither asserts the rate-limit specs in api-keys.ts. Three buckets fire:
 *   - per-email-day     (PER_EMAIL_LIMIT=3 per 24h)
 *   - per-IP hour/day   (PER_IP_HOUR_LIMIT=3, PER_IP_DAY_LIMIT=10)
 *   - global hour/day   (GLOBAL_HOUR_LIMIT=30, GLOBAL_DAY_LIMIT=100)
 *
 * The narrowest deterministic axis to lock is per-email-day: 3 issues per
 * 24h per email. A regression here would let an attacker flood any
 * victim's inbox by replaying the form. The throttle does NOT scale by
 * DEV_RATE_MULTIPLIER (the route uses raw values), so the assertion holds
 * verbatim.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-api-key-throttle-'))
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

let app: FastifyInstance
let mailer: RecordingMailer

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  mailer = new RecordingMailer()
  ;(app as unknown as { mailer: Mailer }).mailer = mailer
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  mailer.sent = []
})

describe('POST /api/api-keys/issue — per-email throttle', () => {
  it('accepts up to 3 issues for one email, then 429s the 4th with retry hint', async () => {
    // Rotate IPs so the per-IP-hour bucket (also limit=3) does not deny
    // before the per-email bucket gets to four hits. The per-email cap is
    // what we're actually exercising.
    const email = 'throttle-target@example.com'
    for (let i = 0; i < 3; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/api-keys/issue',
        payload: { email },
        headers: { 'x-forwarded-for': `203.0.113.${String(150 + i)}` },
      })
      expect(ok.statusCode).toBe(200)
      expect((ok.json() as { status: string }).status).toBe('sent')
    }
    // After 3 issues the email bucket caps. A fresh IP can't bypass.
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/api-keys/issue',
      payload: { email },
      headers: { 'x-forwarded-for': '203.0.113.199' },
    })
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json() as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
    // The bucket window is 24 hours.
    expect(body.retry_after_seconds).toBeLessThanOrEqual(24 * 3600)
  })

  it('a denied 4th attempt does NOT send mail nor write a key row', async () => {
    // The throttle MUST short-circuit before insertApiKey + mailer.send.
    // Otherwise a denied attempt would (a) leak mail volume — undermining
    // the whole point of the throttle — or (b) leave a stranded "throttled"
    // key row that some future cleanup might miss.
    const email = 'silent-target@example.com'
    for (let i = 0; i < 3; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/api-keys/issue',
        payload: { email },
        headers: { 'x-forwarded-for': `203.0.113.${String(160 + i)}` },
      })
    }
    const before = mailer.sent.length
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/api-keys/issue',
      payload: { email },
      headers: { 'x-forwarded-for': '203.0.113.169' },
    })
    expect(blocked.statusCode).toBe(429)
    expect(mailer.sent.length).toBe(before)
    // No row tied to that emailHash beyond the 3 we expected.
    const { hashWithSalt } = await import('../lib/salted-hash.js')
    const targetEmailHash = hashWithSalt(email.toLowerCase())
    const allActive = await app.store.listApiKeys(50, 0, 'active')
    const tiedRows = allActive.filter((k) => k.emailHash === targetEmailHash)
    expect(tiedRows.length).toBe(3)
  })
})

describe('POST /api/api-keys/issue — per-IP-hour throttle', () => {
  it('blocks the 4th request from one IP even when each uses a different email', async () => {
    // Counterpart to the per-email lock: from one IP, 4 distinct emails
    // is enough to trip per-IP-hour=3.
    const ip = '203.0.113.200'
    for (let i = 0; i < 3; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/api-keys/issue',
        payload: { email: `ip-throttle-${String(i)}@example.com` },
        headers: { 'x-forwarded-for': ip },
      })
      expect(ok.statusCode).toBe(200)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/api-keys/issue',
      payload: { email: 'ip-throttle-overflow@example.com' },
      headers: { 'x-forwarded-for': ip },
    })
    expect(blocked.statusCode).toBe(429)
    expect((blocked.json() as { error: string }).error).toBe('rate_limited')
  })
})

describe('POST /api/api-keys/issue — input validation', () => {
  it('returns 400 invalid_input with fields.email for a malformed email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/issue',
      payload: { email: 'not-an-email' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { email?: unknown } }
    expect(body.error).toBe('invalid_input')
    expect(typeof body.fields?.email).toBe('string')
  })

  it('rejects an oversize email at the schema layer (max=200)', async () => {
    const huge = `${'x'.repeat(190)}@example.com` // 202 chars
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/issue',
      payload: { email: huge },
    })
    expect(res.statusCode).toBe(400)
  })
})
