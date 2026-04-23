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
    // each must allow, the fourth must deny. Run the same drain on `b`
    // too — without that, the spec would still pass if `checkAll` had
    // only incremented the first bucket and skipped the rest.
    expect((await limiter.check(a, 3, 60)).allowed).toBe(true)
    expect((await limiter.check(a, 3, 60)).allowed).toBe(true)
    expect((await limiter.check(a, 3, 60)).allowed).toBe(false)
    expect((await limiter.check(b, 3, 60)).allowed).toBe(true)
    expect((await limiter.check(b, 3, 60)).allowed).toBe(true)
    expect((await limiter.check(b, 3, 60)).allowed).toBe(false)
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

  it('returns the longest blocking TTL when multiple buckets deny', async () => {
    const shortWin = `${prefix}window-short`
    const longWin = `${prefix}window-long`
    // Saturate both buckets so both would deny the next hit. The two
    // windows (60s vs 600s) let the assertion distinguish "first denying"
    // from "longest denying".
    for (let i = 0; i < 2; i += 1) {
      await limiter.check(shortWin, 2, 60)
    }
    await limiter.check(longWin, 1, 600)

    const decision = await limiter.checkAll([
      { bucket: shortWin, limit: 2, windowSeconds: 60 },
      { bucket: longWin, limit: 1, windowSeconds: 600 }, // long window
    ])
    expect(decision.allowed).toBe(false)
    // retryAfter must reflect the longer (600s) window so a client that
    // retries at `retryAfter` lands after every denying bucket resets.
    expect(decision.retryAfter).toBeGreaterThan(60)
    expect(decision.retryAfter).toBeLessThanOrEqual(600)
  })
})
