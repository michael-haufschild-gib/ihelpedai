// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { RedisRateLimiter } from './redis-limiter.js'

/**
 * Real-Redis integration spec for {@link RedisRateLimiter}. Gated on
 * `REDIS_URL` so the default `pnpm test` run on machines without Redis stays
 * green; CI / local runs that have Redis available export the env var to
 * exercise the script path.
 *
 * On calmerapy the matching command is:
 *   REDIS_URL=redis://127.0.0.1:6379/15 pnpm test redis-limiter.spec
 *
 * Database 15 is intentionally far from the production DB 0, and every spec
 * scopes its keys to a unique prefix and FLUSHes them in afterEach so reruns
 * are deterministic.
 */
const REDIS_URL = process.env.REDIS_URL

const describeIfRedis = REDIS_URL !== undefined && REDIS_URL !== '' ? describe : describe.skip

describeIfRedis('RedisRateLimiter — real Redis', () => {
  let limiter: RedisRateLimiter
  const prefix = `ihelped-test:${String(Date.now())}:${String(Math.random()).slice(2, 8)}:`

  beforeAll(() => {
    limiter = new RedisRateLimiter(REDIS_URL ?? '')
  })

  afterAll(async () => {
    await limiter.dispose()
  })

  afterEach(async () => {
    // Best-effort cleanup: the keys this test touches are namespaced with the
    // run-unique prefix, so deleting them between tests prevents bucket
    // bleed between cases without disturbing anything else on the server.
    const stale = await (limiter as unknown as { client: { keys: (m: string) => Promise<string[]> } })
      .client.keys(`${prefix}*`)
    if (stale.length > 0) {
      await (limiter as unknown as { client: { del: (...k: string[]) => Promise<number> } })
        .client.del(...stale)
    }
  })

  it('allows up to limit, then denies with retryAfter', async () => {
    const bucket = `${prefix}single`
    for (let i = 0; i < 3; i += 1) {
      const ok = await limiter.check(bucket, 3, 60)
      expect(ok.allowed).toBe(true)
    }
    const blocked = await limiter.check(bucket, 3, 60)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('checkAll commits every bucket atomically when all permit', async () => {
    const a = `${prefix}atomic-a`
    const b = `${prefix}atomic-b`
    const decision = await limiter.checkAll([
      { bucket: a, limit: 3, windowSeconds: 60 },
      { bucket: b, limit: 3, windowSeconds: 60 },
    ])
    expect(decision.allowed).toBe(true)
    // Each bucket should now sit at count=1; two more single-bucket hits
    // each must allow, the fourth must deny.
    expect((await limiter.check(a, 3, 60)).allowed).toBe(true)
    expect((await limiter.check(a, 3, 60)).allowed).toBe(true)
    expect((await limiter.check(a, 3, 60)).allowed).toBe(false)
  })

  it('checkAll commits NOTHING when any bucket would deny', async () => {
    const userBucket = `${prefix}atomic-user`
    const globalBucket = `${prefix}atomic-global`
    // Pre-fill the global bucket so any new hit is rejected by it.
    for (let i = 0; i < 3; i += 1) {
      await limiter.check(globalBucket, 3, 60)
    }
    expect((await limiter.check(globalBucket, 3, 60)).allowed).toBe(false)

    // Failed checkAll must NOT increment the user bucket.
    const decision = await limiter.checkAll([
      { bucket: userBucket, limit: 5, windowSeconds: 60 },
      { bucket: globalBucket, limit: 3, windowSeconds: 60 },
    ])
    expect(decision.allowed).toBe(false)

    // user bucket should still allow 5 fresh hits — proves no leak from the
    // failed call.
    for (let i = 0; i < 5; i += 1) {
      expect((await limiter.check(userBucket, 5, 60)).allowed).toBe(true)
    }
    expect((await limiter.check(userBucket, 5, 60)).allowed).toBe(false)
  })

  it('returns retryAfter from the first denying bucket', async () => {
    const first = `${prefix}window-first`
    const second = `${prefix}window-second`
    // Saturate `first` against a short 60s window.
    for (let i = 0; i < 2; i += 1) {
      await limiter.check(first, 2, 60)
    }
    const decision = await limiter.checkAll([
      { bucket: first, limit: 2, windowSeconds: 60 },
      { bucket: second, limit: 1, windowSeconds: 600 }, // long window
    ])
    expect(decision.allowed).toBe(false)
    // retryAfter must reflect the first (60s) window, not the second (600s).
    expect(decision.retryAfter).toBeLessThanOrEqual(60)
  })
})
