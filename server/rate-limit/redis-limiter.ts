import type { RateLimitDecision, RateLimiter } from './index.js'

/**
 * Redis-backed rate limiter. Stub for Round 1A; production rounds
 * implement atomic INCR+EXPIRE against the production Redis. Constructor
 * fails fast so a misconfigured deploy never silently routes checks into
 * an unimplemented backend.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(_url: string) {
    throw new Error(
      'RATE_LIMIT=redis is not yet implemented in this build. Use RATE_LIMIT=memory.',
    )
  }

  async check(
    _bucket: string,
    _limit: number,
    _windowSeconds: number,
  ): Promise<RateLimitDecision> {
    throw new Error('unreachable')
  }
}
