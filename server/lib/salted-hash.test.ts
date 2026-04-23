// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { hashWithSalt } from './salted-hash.js'

/**
 * Module-scoped config caches IP_HASH_SALT at import time, so tests here
 * don't try to swap the salt at runtime. Instead we lock the shape + the
 * unknown-sentinel contract: same input produces the same hash, distinct
 * inputs produce distinct hashes, undefined and empty string both fold into
 * the same "unknown" bucket.
 */
describe('hashWithSalt', () => {
  it('returns a 64-char hex sha256', () => {
    expect(hashWithSalt('foo')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', () => {
    expect(hashWithSalt('foo')).toBe(hashWithSalt('foo'))
  })

  it('distinct inputs produce distinct hashes', () => {
    expect(hashWithSalt('alice')).not.toBe(hashWithSalt('bob'))
  })

  it('undefined and empty string both collapse to the unknown sentinel', () => {
    // Both must share the same hash as the string 'unknown' so anonymous
    // / IP-less requests share one bucket instead of each creating their
    // own per-worker shard.
    expect(hashWithSalt(undefined)).toBe(hashWithSalt(''))
    expect(hashWithSalt(undefined)).toBe(hashWithSalt('unknown'))
  })
})
