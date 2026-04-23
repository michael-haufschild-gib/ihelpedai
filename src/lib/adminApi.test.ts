import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN_SESSION_EXPIRED_EVENT, getMe } from './adminApi'
import { ApiError } from './httpClient'

/**
 * Lock the admin fetch wrapper's session-expiry contract:
 *   - On 401 responses, dispatch a window event that downstream state
 *     subscribers use to clear the admin store and redirect.
 *   - On non-401 failures (rate limited, internal error, network), do NOT
 *     dispatch the event — those need their own per-page handling.
 *   - On 2xx responses, do NOT dispatch the event.
 * Wrapping fetch in vi.stubGlobal isolates this from every other test and
 * matches the httpClient.test.ts style.
 */
describe('adminApi — 401 → admin-session-expired event', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  let eventSpy: (e: Event) => void
  let eventCallCount: number

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    eventCallCount = 0
    eventSpy = () => {
      eventCallCount += 1
    }
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, eventSpy)
  })

  afterEach(() => {
    window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, eventSpy)
    vi.unstubAllGlobals()
  })

  it('dispatches admin-session-expired on a 401 response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    )
    await expect(getMe()).rejects.toBeInstanceOf(ApiError)
    expect(eventCallCount).toBe(1)
  })

  it('does not dispatch on 2xx success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'abc', email: 'a@b.c', status: 'active' }), {
        status: 200,
      }),
    )
    const me = await getMe()
    expect(me.email).toBe('a@b.c')
    expect(eventCallCount).toBe(0)
  })

  it('does not dispatch on non-401 errors like 429', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'rate_limited', retry_after_seconds: 30 }),
        { status: 429 },
      ),
    )
    await expect(getMe()).rejects.toBeInstanceOf(ApiError)
    expect(eventCallCount).toBe(0)
  })
})
