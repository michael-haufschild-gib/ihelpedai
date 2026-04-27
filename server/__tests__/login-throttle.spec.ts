// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for the multi-bucket /api/admin/login throttle.
 *
 * Five throttle buckets fire on every login attempt:
 *   1. per-IP    — 5  per 15 minutes  (LOGIN_IP_WINDOW_LIMIT)
 *   2. per-email — 10 per hour        (LOGIN_EMAIL_HOUR_LIMIT)
 *   3. per-email — 50 per day         (LOGIN_EMAIL_DAY_LIMIT)
 *   4. global    — 500 per hour       (LOGIN_GLOBAL_HOUR_LIMIT)
 *
 * Each axis defends a different abuse vector:
 *   - per-IP catches a single-host brute force
 *   - per-email catches credential stuffing across a botnet aimed at one admin
 *   - global is the last-resort site-wide kill switch
 *
 * The throttle is *atomic*: when any bucket denies, NO bucket increments.
 * Without that property, a 429 from the global bucket would still squeeze
 * the legitimate caller's per-IP budget — we lock that here too.
 *
 * Successful logins also pay throttle cost. Every attempt — pass or fail —
 * is one tick on every bucket. So a test that needs N successful logins
 * must guarantee N stays under each cap simultaneously.
 *
 * The throttle does NOT scale by DEV_RATE_MULTIPLIER (auth.ts uses raw
 * limits). Tests must therefore avoid burning the per-email-hour cap
 * across the spec by using fresh emails per test.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-login-throttle-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '1'

const SHARED_PASSWORD = 'testpassword12'

let app: FastifyInstance

async function seedAdmin(email: string, status: 'active' | 'deactivated' = 'active'): Promise<string> {
  const hash = await bcrypt.hash(SHARED_PASSWORD, 10)
  const admin = await app.store.insertAdmin(email, hash, null)
  if (status === 'deactivated') {
    await app.store.updateAdminStatus(admin.id, 'deactivated')
  }
  return admin.id
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('login throttle — per-IP-window cap', () => {
  it('5 attempts from the same IP succeed; the 6th returns 429 with retry_after_seconds', async () => {
    // Burn the per-IP-window bucket WITHOUT burning the per-email caps:
    // rotate the email each call. Every attempt at this single IP counts
    // toward the same per-IP bucket; the per-email buckets see only one
    // attempt each.
    const ip = '203.0.113.10'
    for (let i = 0; i < 5; i += 1) {
      const email = `ip-window-${String(i)}@admin.ai`
      await seedAdmin(email)
      const ok = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { email, password: SHARED_PASSWORD },
        headers: { 'x-forwarded-for': ip },
      })
      expect(ok.statusCode).toBe(200)
    }

    const sixthEmail = 'ip-window-overflow@admin.ai'
    await seedAdmin(sixthEmail)
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: sixthEmail, password: SHARED_PASSWORD },
      headers: { 'x-forwarded-for': ip },
    })
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json() as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
    // 15-minute window upper bound. A retry hint past the window would be
    // a bug — clients would advertise a stale wait period to the user.
    expect(body.retry_after_seconds).toBeLessThanOrEqual(15 * 60)
  })
})

describe('login throttle — per-email-hour cap', () => {
  it('10 attempts at one email from rotating IPs succeed; the 11th 429s', async () => {
    // Burn the per-email-hour bucket WITHOUT burning the per-IP-window
    // bucket: rotate the IP each call. Every attempt at this single email
    // counts toward the same per-email bucket.
    const email = 'email-hour-target@admin.ai'
    await seedAdmin(email)
    for (let i = 0; i < 10; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { email, password: SHARED_PASSWORD },
        headers: { 'x-forwarded-for': `203.0.113.${String(50 + i)}` },
      })
      expect(ok.statusCode).toBe(200)
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email, password: SHARED_PASSWORD },
      headers: { 'x-forwarded-for': '203.0.113.99' },
    })
    expect(blocked.statusCode).toBe(429)
    expect((blocked.json() as { error: string }).error).toBe('rate_limited')
  })
})

describe('login throttle — atomicity', () => {
  it('a 429 from per-IP-window does NOT consume the per-email-hour budget for the named admin', async () => {
    // Saturate the per-IP-window with rotating emails so the 6th hit at
    // the same IP must 429 by the per-IP bucket. The per-email bucket
    // for the *target* admin should NOT have ticked.
    const ip = '203.0.113.140'
    for (let i = 0; i < 5; i += 1) {
      const email = `atomic-decoy-${String(i)}@admin.ai`
      await seedAdmin(email)
      const ok = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { email, password: SHARED_PASSWORD },
        headers: { 'x-forwarded-for': ip },
      })
      expect(ok.statusCode).toBe(200)
    }

    const target = 'atomic-target@admin.ai'
    await seedAdmin(target)

    // 6th at same IP — denied by per-IP-window. Per-email-hour for target
    // must NOT increment. Without atomicity, this single denied call
    // would silently burn 1/10 of the target admin's hourly budget.
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: target, password: SHARED_PASSWORD },
      headers: { 'x-forwarded-for': ip },
    })
    expect(blocked.statusCode).toBe(429)

    // Now exercise 10 fresh logins for the target admin from rotating
    // IPs. With atomicity, all 10 succeed. Without atomicity, only 9
    // succeed and the 10th 429s — that diff is the lock here.
    for (let i = 0; i < 10; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { email: target, password: SHARED_PASSWORD },
        headers: { 'x-forwarded-for': `203.0.113.${String(160 + i)}` },
      })
      expect(ok.statusCode).toBe(200)
    }
  })
})

describe('login response shape — timing-oracle defence', () => {
  // The DUMMY_BCRYPT_HASH branch in auth.ts runs bcrypt.compare on every
  // login regardless of whether the admin exists or is deactivated. We
  // can't measure timing reliably in unit tests, but we CAN lock the
  // response shape — every wrong-credentials path returns identical body
  // + status. A regression that early-returned for unknown emails would
  // skip the bcrypt cost AND change the response shape, both visible.

  it('unknown email and wrong password return identical 401 envelope', async () => {
    const wrongPasswordEmail = 'identical-shape-target@admin.ai'
    await seedAdmin(wrongPasswordEmail)

    const wrongPwd = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: wrongPasswordEmail, password: 'wrongpassword456' },
      headers: { 'x-forwarded-for': '203.0.113.200' },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'definitely-not-a-real-admin@admin.ai', password: 'anything12345' },
      headers: { 'x-forwarded-for': '203.0.113.201' },
    })

    expect(wrongPwd.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrongPwd.json()).toEqual(unknown.json())
  })

  it('deactivated admin and unknown email return identical 401 envelope', async () => {
    const deactivatedEmail = 'deactivated-shape-target@admin.ai'
    await seedAdmin(deactivatedEmail, 'deactivated')

    const deactivated = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: deactivatedEmail, password: SHARED_PASSWORD },
      headers: { 'x-forwarded-for': '203.0.113.210' },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'still-not-a-real-admin@admin.ai', password: 'anything12345' },
      headers: { 'x-forwarded-for': '203.0.113.211' },
    })

    expect(deactivated.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(deactivated.json()).toEqual(unknown.json())
  })
})
