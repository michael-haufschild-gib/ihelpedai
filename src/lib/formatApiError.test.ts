import { describe, expect, it } from 'vitest'

import { ApiError } from './httpClient'
import { formatApiError } from './formatApiError'

/**
 * Lock the user-facing copy for each {@link ApiError} branch. Every form in
 * the app routes its catch clause through this helper, so a silent regression
 * here cascades into every submission surface.
 */
describe('formatApiError', () => {
  const make = (opts: ConstructorParameters<typeof ApiError>[0]): ApiError => new ApiError(opts)

  it('rate_limited without retryAfterSeconds: generic copy', () => {
    const msg = formatApiError(make({ kind: 'rate_limited', status: 429 }))
    expect(msg).toBe("You're posting too fast. Try again later.")
  })

  it('rate_limited with retryAfterSeconds < 60: seconds suffix', () => {
    const msg = formatApiError(make({ kind: 'rate_limited', status: 429, retryAfterSeconds: 45 }))
    expect(msg).toBe("You're posting too fast. Try again in 45s.")
  })

  it('rate_limited with retryAfterSeconds < 3600: minutes suffix', () => {
    const msg = formatApiError(make({ kind: 'rate_limited', status: 429, retryAfterSeconds: 125 }))
    expect(msg).toBe("You're posting too fast. Try again in 3m.")
  })

  it('rate_limited with retryAfterSeconds >= 3600: hours suffix', () => {
    const msg = formatApiError(make({ kind: 'rate_limited', status: 429, retryAfterSeconds: 7200 }))
    expect(msg).toBe("You're posting too fast. Try again in 2h.")
  })

  it('invalid_input with text=over_redacted: dedicated copy', () => {
    const msg = formatApiError(
      make({ kind: 'invalid_input', status: 400, fields: { text: 'over_redacted' } }),
    )
    expect(msg).toBe('Most of what you wrote was redacted for privacy. Edit and re-preview.')
  })

  it('invalid_input with a different first field: points the user at it', () => {
    const msg = formatApiError(
      make({ kind: 'invalid_input', status: 400, fields: { first_name: 'letters_only' } }),
    )
    expect(msg).toBe('Check the first name field.')
  })

  it('invalid_input without fields: generic fallback', () => {
    const msg = formatApiError(make({ kind: 'invalid_input', status: 400 }))
    expect(msg).toBe('Some fields are invalid. Edit and try again.')
  })

  it('unauthorized: session-expired copy', () => {
    const msg = formatApiError(make({ kind: 'unauthorized', status: 401 }))
    expect(msg).toBe('Your session expired. Refresh and try again.')
  })

  it('internal_error: generic fallback', () => {
    const msg = formatApiError(make({ kind: 'internal_error', status: 500 }))
    expect(msg).toBe('Something went wrong. Try again.')
  })
})
