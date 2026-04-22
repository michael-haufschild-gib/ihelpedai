/** Result of a rate-limit check. */
export type RateLimitDecision = {
  allowed: boolean
  retryAfter: number
}

/** A single bucket specification for {@link RateLimiter.checkAll}. */
export interface BucketSpec {
  bucket: string
  limit: number
  windowSeconds: number
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

  /**
   * Atomic multi-bucket check. Either every bucket allows AND every bucket
   * increments, or no bucket increments and the first denying decision is
   * returned. This eliminates the over-counting that occurs with sequential
   * `check` calls when an early bucket allows but a later one denies — the
   * earlier hit gets recorded against a bucket that the request never used.
   */
  checkAll(specs: ReadonlyArray<BucketSpec>): Promise<RateLimitDecision>
}
