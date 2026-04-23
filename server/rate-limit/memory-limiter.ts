import type { BucketSpec, RateLimitDecision, RateLimiter } from './index.js'

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
    return this.checkAll([{ bucket, limit, windowSeconds }])
  }

  async checkAll(specs: ReadonlyArray<BucketSpec>): Promise<RateLimitDecision> {
    if (specs.length === 0) return { allowed: true, retryAfter: 0 }
    // Duplicate bucket names in a single call are a caller bug: the preview
    // pass snapshots `existing` once per spec, so a repeated bucket would
    // only count a single hit. Fail closed rather than silently weakening
    // the limit. The Redis impl's Lua script has the same property because
    // `GET` reflects earlier `INCR`s within a call, but in-memory the
    // preview is static — so reject here explicitly.
    const seen = new Set<string>()
    for (const spec of specs) {
      if (seen.has(spec.bucket)) return { allowed: false, retryAfter: 1 }
      seen.add(spec.bucket)
    }
    const now = Date.now()
    // First pass: peek at every bucket's current state and decide whether
    // this request would be allowed across all of them. No mutation happens
    // until the second pass — that is what makes `checkAll` atomic.
    const previews: { spec: BucketSpec; existing: Record | undefined }[] = []
    for (const spec of specs) {
      if (
        !Number.isFinite(spec.limit) ||
        spec.limit < 1 ||
        !Number.isFinite(spec.windowSeconds) ||
        spec.windowSeconds <= 0
      ) {
        return { allowed: false, retryAfter: 1 }
      }
      const existing = this.store.get(spec.bucket)
      const expired = existing === undefined || existing.expiresAt <= now
      if (!expired && existing.count >= spec.limit) {
        const retryAfter = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
        return { allowed: false, retryAfter }
      }
      previews.push({ spec, existing })
    }
    // Second pass: every bucket allows, so commit the increments together.
    for (const { spec, existing } of previews) {
      if (existing === undefined || existing.expiresAt <= now) {
        this.store.set(spec.bucket, { count: 1, expiresAt: now + spec.windowSeconds * 1000 })
      } else {
        existing.count += 1
      }
    }
    return { allowed: true, retryAfter: 0 }
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
