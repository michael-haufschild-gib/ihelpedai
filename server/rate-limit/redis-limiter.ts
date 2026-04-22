import { Redis } from 'ioredis'

import type { BucketSpec, RateLimitDecision, RateLimiter } from './index.js'

/**
 * Redis-backed sliding-window-ish rate limiter using a single Lua script for
 * atomic multi-bucket evaluation.
 *
 * Atomicity matters: a multi-process (or multi-restart) deploy must not lose
 * counters between requests, and a `checkAll` against N buckets must commit
 * either every increment or none of them. Without the Lua script, an INCR /
 * EXPIRE pair against multiple keys interleaves with other workers' scripts
 * and can leave any of:
 *   - a key incremented but missing its TTL (it never expires),
 *   - early buckets incremented while a later one would deny,
 *   - two workers both observing `INCR` returning 1 and racing the EXPIRE.
 *
 * The script below is server-side: Redis serialises script execution per
 * shard, so the entire check + commit happens between any two other Redis
 * commands. One round-trip per `checkAll`.
 *
 * Return contract from the script:
 *   `{1, 0}`      → allowed; every bucket was incremented (TTL set on first hit).
 *   `{0, secs}`   → denied; `secs` is the seconds-until-reset of the first bucket
 *                   that would have exceeded its limit. No bucket was modified.
 */
export class RedisRateLimiter implements RateLimiter {
  private readonly client: Redis

  constructor(url: string) {
    if (url === '') {
      throw new Error('RedisRateLimiter requires a non-empty REDIS_URL')
    }
    this.client = new Redis(url, {
      // Bounded fast-fail behaviour. The offline queue stays ON so commands
      // issued during the brief initial-connect window queue (instead of
      // erroring with "Stream isn't writeable"), but a 2 s connect timeout
      // and capped retries mean a genuinely-down Redis surfaces an error to
      // the caller within seconds rather than retrying indefinitely. A
      // downed limiter must not become a downed API.
      enableOfflineQueue: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 100, 1000)),
    })
  }

  async check(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    return this.checkAll([{ bucket, limit, windowSeconds }])
  }

  async checkAll(specs: ReadonlyArray<BucketSpec>): Promise<RateLimitDecision> {
    if (specs.length === 0) return { allowed: true, retryAfter: 0 }
    for (const spec of specs) {
      if (
        !Number.isFinite(spec.limit) ||
        spec.limit < 1 ||
        !Number.isFinite(spec.windowSeconds) ||
        spec.windowSeconds <= 0
      ) {
        return { allowed: false, retryAfter: 1 }
      }
    }

    const keys = specs.map((s) => s.bucket)
    const args: string[] = []
    for (const s of specs) {
      args.push(String(s.limit), String(s.windowSeconds))
    }

    const reply = (await this.client.eval(CHECK_ALL_SCRIPT, keys.length, ...keys, ...args)) as [number, number]
    const [allowedFlag, retryAfter] = reply
    if (allowedFlag === 1) return { allowed: true, retryAfter: 0 }
    return { allowed: false, retryAfter: Math.max(1, retryAfter) }
  }

  /** Close the connection. Call on graceful shutdown so the process can exit. */
  async dispose(): Promise<void> {
    await this.client.quit().catch(() => undefined)
  }
}

/**
 * KEYS = [bucket1..N], ARGV = [limit1, ttl1, limit2, ttl2, ...]. Two passes:
 * peek every bucket for would-deny (no mutation); if all clear, INCR each and
 * set EXPIRE on the first hit.
 */
const CHECK_ALL_SCRIPT = `
local n = #KEYS
for i = 1, n do
  local key = KEYS[i]
  local limit = tonumber(ARGV[2*i - 1])
  local current = tonumber(redis.call('GET', key)) or 0
  if current >= limit then
    local pttl = redis.call('PTTL', key)
    local ttlSecs
    if pttl < 0 then
      ttlSecs = tonumber(ARGV[2*i])
    else
      ttlSecs = math.ceil(pttl / 1000)
    end
    if ttlSecs < 1 then ttlSecs = 1 end
    return {0, ttlSecs}
  end
end
for i = 1, n do
  local key = KEYS[i]
  local ttl = tonumber(ARGV[2*i])
  local newCount = redis.call('INCR', key)
  if newCount == 1 then
    redis.call('EXPIRE', key, ttl)
  end
end
return {1, 0}
`
