import type { RateLimitDecision, RateLimiter } from './index.js'

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

type Record = {
  count: number
  expiresAt: number
}

/**
 * In-memory sliding-window-ish rate limiter (fixed window per bucket).
 * Each bucket expires after windowSeconds; the window resets on expiry.
 * A lightweight timer sweeps expired records every 5 minutes.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, Record>()
  private readonly sweeper: ReturnType<typeof setInterval>

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS)
    // Let the process exit even while the sweeper is scheduled.
    if (typeof this.sweeper.unref === 'function') this.sweeper.unref()
  }

  async check(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const now = Date.now()
    const existing = this.store.get(bucket)
    if (existing === undefined || existing.expiresAt <= now) {
      this.store.set(bucket, { count: 1, expiresAt: now + windowSeconds * 1000 })
      return { allowed: true, retryAfter: 0 }
    }
    if (existing.count < limit) {
      existing.count += 1
      return { allowed: true, retryAfter: 0 }
    }
    const retryAfter = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
    return { allowed: false, retryAfter }
  }

  /** Releases the cleanup timer; call from tests or on shutdown. */
  dispose(): void {
    clearInterval(this.sweeper)
    this.store.clear()
  }

  private sweep(): void {
    const now = Date.now()
    for (const [k, v] of this.store) {
      if (v.expiresAt <= now) this.store.delete(k)
    }
  }
}
