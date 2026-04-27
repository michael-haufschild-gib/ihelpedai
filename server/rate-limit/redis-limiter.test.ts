// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Intercept ioredis before the limiter imports it. The constructor opens a
// real TCP socket unless we swap it out, which would hang CI on a machine
// without Redis running. The factory form keeps the fake self-contained so
// vi.mock's hoist-to-top doesn't collide with module-local declarations.
type EvalReply = [number, number]
interface FakeClient {
  eval: (...args: unknown[]) => Promise<EvalReply>
  evalImpl: () => Promise<EvalReply>
  on: (event: string, cb: (...args: unknown[]) => void) => FakeClient
  quit: () => Promise<void>
}

vi.mock('ioredis', () => {
  class FakeRedis implements FakeClient {
    public evalImpl: () => Promise<EvalReply> = () => Promise.resolve([1, 0] as EvalReply)

    constructor(_url: string, _opts: unknown) {
      // No-op: tests own eval behaviour via evalImpl.
    }

    async eval(..._args: unknown[]): Promise<EvalReply> {
      return this.evalImpl()
    }

    on(_event: string, _cb: (...args: unknown[]) => void): this {
      return this
    }

    async quit(): Promise<void> {
      // No-op.
    }
  }
  return { Redis: FakeRedis }
})

import { RedisRateLimiter } from './redis-limiter.js'

describe('RedisRateLimiter outage semantics', () => {
  let limiter: RedisRateLimiter
  let stderrWrites: string[]
  let originalStderrWrite: typeof process.stderr.write

  beforeEach(() => {
    stderrWrites = []
    originalStderrWrite = process.stderr.write.bind(process.stderr)
    // Capture stderr instead of polluting test output.
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderrWrites.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }) as typeof process.stderr.write

    limiter = new RedisRateLimiter('redis://localhost:6379')
  })

  afterEach(async () => {
    process.stderr.write = originalStderrWrite
    await limiter.dispose()
  })

  it('fails open when eval throws, returning allowed=true', async () => {
    // Reach into the fake client and force the next eval to reject with a
    // connection-style error — mirrors a genuine Redis outage.
    const fake = (limiter as unknown as { client: FakeClient }).client
    fake.evalImpl = () => Promise.reject(new Error('ECONNREFUSED'))

    const decision = await limiter.checkAll([{ bucket: 'x', limit: 5, windowSeconds: 60 }])
    expect(decision).toEqual({ allowed: true, retryAfter: 0 })
    // One outage log line should have been written.
    expect(stderrWrites.some((s) => s.includes('[redis-limiter] outage'))).toBe(true)
  })

  it('throttles outage logs to at most one per 30 seconds', async () => {
    const fake = (limiter as unknown as { client: FakeClient }).client
    fake.evalImpl = () => Promise.reject(new Error('connection closed'))

    // Five rapid calls in quick succession — only the first should emit a log.
    for (let i = 0; i < 5; i += 1) {
      await limiter.checkAll([{ bucket: 'x', limit: 5, windowSeconds: 60 }])
    }
    const outageLines = stderrWrites.filter((s) => s.includes('[redis-limiter] outage'))
    expect(outageLines.length).toBe(1)
  })

  it('passes through the happy path when eval returns {1, 0}', async () => {
    const fake = (limiter as unknown as { client: FakeClient }).client
    fake.evalImpl = () => Promise.resolve([1, 0])

    const decision = await limiter.checkAll([{ bucket: 'x', limit: 5, windowSeconds: 60 }])
    expect(decision).toEqual({ allowed: true, retryAfter: 0 })
  })

  it('parses a deny reply as {allowed: false, retryAfter: secs}', async () => {
    const fake = (limiter as unknown as { client: FakeClient }).client
    fake.evalImpl = () => Promise.resolve([0, 42])

    const decision = await limiter.checkAll([{ bucket: 'x', limit: 1, windowSeconds: 60 }])
    expect(decision).toEqual({ allowed: false, retryAfter: 42 })
  })

  it('clamps retryAfter=0 to 1 so callers never advertise "retry in 0 seconds"', async () => {
    const fake = (limiter as unknown as { client: FakeClient }).client
    fake.evalImpl = () => Promise.resolve([0, 0])

    const decision = await limiter.checkAll([{ bucket: 'x', limit: 1, windowSeconds: 60 }])
    expect(decision).toEqual({ allowed: false, retryAfter: 1 })
  })

  it('rejects specs with non-finite limit before touching Redis', async () => {
    const fake = (limiter as unknown as { client: FakeClient }).client
    let called = 0
    fake.evalImpl = () => {
      called += 1
      return Promise.resolve([1, 0])
    }
    const decision = await limiter.checkAll([{ bucket: 'x', limit: Number.NaN, windowSeconds: 60 }])
    expect(decision).toEqual({ allowed: false, retryAfter: 1 })
    expect(called).toBe(0)
  })

  it('rejects duplicate bucket specs before touching Redis', async () => {
    const fake = (limiter as unknown as { client: FakeClient }).client
    let called = 0
    fake.evalImpl = () => {
      called += 1
      return Promise.resolve([1, 0])
    }
    const decision = await limiter.checkAll([
      { bucket: 'same', limit: 2, windowSeconds: 60 },
      { bucket: 'same', limit: 2, windowSeconds: 60 },
    ])
    expect(decision).toEqual({ allowed: false, retryAfter: 1 })
    expect(called).toBe(0)
  })
})
