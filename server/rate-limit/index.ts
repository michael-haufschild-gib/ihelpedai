/** Result of a rate-limit check. */
export type RateLimitDecision = {
  allowed: boolean
  retryAfter: number
}

/**
 * Sliding-window rate limiter abstraction. Dev impl keeps counts in a
 * process-local Map; production impl is Redis-backed.
 */
export interface RateLimiter {
  /**
   * Check and record a hit against `bucket`. Returns whether this hit is
   * allowed and, when not, the number of seconds until the window frees up.
   */
  check(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>
}
