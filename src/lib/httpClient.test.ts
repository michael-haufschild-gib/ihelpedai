import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, buildApiErrorFromBody, buildQuery, jsonBody, request } from './httpClient'

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
    expect(buildQuery({ q: 'cats', page: 2, missing: undefined, cleared: null })).toBe('?q=cats&page=2')
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

/**
 * `request<T>` is the wrapper every caller in api.ts / adminApi.ts routes
 * through. These tests pin its behaviour across the four failure + success
 * axes so a future refactor of the JSON / error / network paths cannot
 * silently change the shape the rest of the app relies on.
 */
describe('request', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Pull `init` off the n-th recorded fetch call with consistent guards. */
  const getFetchInit = (callIndex = 0): RequestInit => {
    const call = fetchSpy.mock.calls[callIndex]
    if (call === undefined) throw new Error(`expected fetch call at index ${callIndex}`)
    const init = call[1]
    if (init === undefined) throw new Error('expected fetch init argument')
    return init as RequestInit
  }

  it('returns the parsed JSON body on 2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ hello: 'world' }), { status: 200 }))
    const out = await request<{ hello: string }>('/api/example')
    expect(out).toEqual({ hello: 'world' })
  })

  it('returns null when a 2xx response has an empty body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 204 }))
    const out = await request<null>('/api/logout')
    expect(out).toBe(null)
  })

  it('throws ApiError with status=0 on fetch network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const err = await request('/api/example').then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe('internal_error')
    expect((err as ApiError).status).toBe(0)
    expect((err as ApiError).message).toContain('Failed to fetch')
  })

  it('throws a typed ApiError built from the server envelope on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_input', fields: { text: 'over_redacted' } }), { status: 400 }),
    )
    const err = await request('/api/example').then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe('invalid_input')
    expect((err as ApiError).status).toBe(400)
    expect((err as ApiError).fields).toEqual({ text: 'over_redacted' })
  })

  it('throws ApiError carrying HTTP status even when the error body is non-JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }))
    const err = await request('/api/example').then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(502)
    // Unknown envelope.error falls back to internal_error without hiding the
    // real HTTP status — callers branch on `status` in the nginx-502 case.
    expect((err as ApiError).kind).toBe('internal_error')
  })

  it('sets content-type when a body is provided and preserves caller headers', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await request('/api/example', jsonBody({ foo: 1 }))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const init = getFetchInit()
    const headers = init.headers as Headers
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('accept')).toBe('application/json')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"foo":1}')
  })

  it('omits content-type when no body is provided (GET)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await request('/api/example')
    const init = getFetchInit()
    const headers = init.headers as Headers
    expect(headers.has('content-type')).toBe(false)
    expect(headers.get('accept')).toBe('application/json')
  })

  it('normalizes a Headers instance so caller-supplied keys survive the merge', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const supplied = new Headers({ 'x-caller': 'kept', 'content-type': 'text/plain' })
    await request('/api/example', { method: 'POST', body: 'raw', headers: supplied })
    const init = getFetchInit()
    const headers = init.headers as Headers
    expect(headers.get('x-caller')).toBe('kept')
    // Caller overrides the default content-type — we only set it when absent.
    expect(headers.get('content-type')).toBe('text/plain')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('throws ApiError with internal_error on an unparseable 2xx body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>200 OK but HTML?</html>', { status: 200 }))
    const err = await request('/api/example').then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe('internal_error')
    expect((err as ApiError).status).toBe(200)
  })
})
