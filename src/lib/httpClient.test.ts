import { describe, expect, it } from 'vitest'

import { ApiError, buildApiErrorFromBody, buildQuery } from './httpClient'

/**
 * Locks the contract that `buildQuery` skips both `undefined` and `null`,
 * never emitting the literal `"null"` token. Earlier versions skipped only
 * `undefined`; a caller passing `null` to clear a filter would get a
 * `?status=null` URL and search for the literal string. Catching this with
 * a test prevents the silent regression.
 */
describe('buildQuery', () => {
  it('returns an empty string when every value is undefined or null', () => {
    expect(buildQuery({ a: undefined, b: null })).toBe('')
  })

  it('skips undefined and null entries; serialises the rest', () => {
    expect(buildQuery({ q: 'cats', page: 2, missing: undefined, cleared: null })).toBe(
      '?q=cats&page=2',
    )
  })

  it('serialises booleans as true/false strings', () => {
    expect(buildQuery({ flag: true, off: false })).toBe('?flag=true&off=false')
  })

  it('discards object/array values at runtime even if a caller widens the type', () => {
    // Cast through unknown to simulate a caller-side type widening (e.g. a
    // map where TypeScript inferred unknown). The runtime type guard must
    // refuse to stringify these — otherwise the URL becomes "[object Object]".
    const sneaky = { good: 'yes', bad: { nested: true } as unknown as string }
    expect(buildQuery(sneaky)).toBe('?good=yes')
  })
})

describe('buildApiErrorFromBody', () => {
  it('returns a typed ApiError for a recognized envelope', () => {
    const err = buildApiErrorFromBody(429, {
      error: 'rate_limited',
      retry_after_seconds: 30,
      message: 'Slow down',
    })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('rate_limited')
    expect(err.status).toBe(429)
    expect(err.retryAfterSeconds).toBe(30)
    expect(err.message).toBe('Slow down')
  })

  it('falls back to internal_error for an unknown envelope.error', () => {
    const err = buildApiErrorFromBody(500, { error: 'mystery' })
    expect(err.kind).toBe('internal_error')
    expect(err.status).toBe(500)
  })

  it('survives a non-record body (e.g. nginx HTML 502 page)', () => {
    const err = buildApiErrorFromBody(502, '<html>Bad Gateway</html>')
    expect(err.kind).toBe('internal_error')
    expect(err.status).toBe(502)
    expect(err.fields).toBe(undefined)
  })

  it('extracts string-only field error map; ignores non-string entries', () => {
    const err = buildApiErrorFromBody(400, {
      error: 'invalid_input',
      fields: { name: 'required', age: 42, nested: { x: 1 } },
    })
    expect(err.fields).toEqual({ name: 'required' })
  })
})
