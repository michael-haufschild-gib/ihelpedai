// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryRateLimiter } from './memory-limiter.js'

/**
 * The atomicity guarantee of {@link MemoryRateLimiter.checkAll}: when any
 * single bucket would deny, no bucket is incremented. Without that property,
 * a request rejected by the global cap would still consume capacity from the
 * caller's per-IP buckets — silently squeezing well-behaved users when the
 * site is under pressure.
 */
describe('MemoryRateLimiter.checkAll — atomicity', () => {
  let limiter: MemoryRateLimiter

  beforeEach(() => {
    limiter = new MemoryRateLimiter()
  })

  afterEach(() => {
    limiter.dispose()
  })

  it('returns allowed=true and increments every bucket when all permit', async () => {
    const decision = await limiter.checkAll([
      { bucket: 'a', limit: 3, windowSeconds: 60 },
      { bucket: 'b', limit: 3, windowSeconds: 60 },
    ])
    expect(decision).toEqual({ allowed: true, retryAfter: 0 })
    // After one checkAll, each bucket should now sit at count=1. Verify by
    // calling check() twice more — both must allow.
    expect((await limiter.check('a', 3, 60)).allowed).toBe(true)
    expect((await limiter.check('a', 3, 60)).allowed).toBe(true)
    // Fourth hit on bucket "a" must deny.
    expect((await limiter.check('a', 3, 60)).allowed).toBe(false)
  })

  it('does not increment any bucket when one would deny', async () => {
    // Pre-fill bucket "global" so any new hit will be rejected by it.
    for (let i = 0; i < 3; i += 1) {
      await limiter.check('global', 3, 60)
    }
    expect((await limiter.check('global', 3, 60)).allowed).toBe(false)

    // Reset the per-user bucket count to a known starting state — it should
    // stay at zero through the failing checkAll below.
    const before = await limiter.checkAll([
      { bucket: 'user', limit: 5, windowSeconds: 60 },
      { bucket: 'global', limit: 3, windowSeconds: 60 },
    ])
    expect(before.allowed).toBe(false)
    expect(before.retryAfter).toBeGreaterThan(0)

    // The user bucket should NOT have been incremented by the failed call —
    // we should still be able to hit it 5 times before it denies.
    for (let i = 0; i < 5; i += 1) {
      const ok = await limiter.check('user', 5, 60)
      expect(ok.allowed).toBe(true)
    }
    expect((await limiter.check('user', 5, 60)).allowed).toBe(false)
  })

  it('returns the first denying bucket retryAfter, not the last', async () => {
    for (let i = 0; i < 2; i += 1) {
      await limiter.check('first', 2, 60)
    }
    const decision = await limiter.checkAll([
      { bucket: 'first', limit: 2, windowSeconds: 60 },
      { bucket: 'second', limit: 1, windowSeconds: 600 }, // long window
    ])
    expect(decision.allowed).toBe(false)
    // retryAfter must come from `first` (which has the 60s window), not the
    // 600s `second` window — `first` is the one actually blocking.
    expect(decision.retryAfter).toBeLessThanOrEqual(60)
  })
})
