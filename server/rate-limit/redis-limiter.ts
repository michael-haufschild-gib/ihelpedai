import type { RateLimitDecision, RateLimiter } from './index.js'

/**
 * Redis-backed rate limiter. Stub for Round 1A; production rounds
 * implement atomic INCR+EXPIRE against the production Redis.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(_url: string) {
    // no-op stub; real client wiring comes later.
  }

  async check(
    _bucket: string,
    _limit: number,
    _windowSeconds: number,
  ): Promise<RateLimitDecision> {
    throw new Error('RedisRateLimiter.check not yet implemented')
  }
}
