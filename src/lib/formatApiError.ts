import type { ApiError } from './api'

/**
 * Map an {@link ApiError} to a short user-facing message. Shared by every
 * submission surface so error copy stays consistent across forms. Handles the
 * `text = over_redacted` sub-case explicitly because that outcome is visible
 * on the preview screen and deserves its own phrasing.
 */
export function formatApiError(err: ApiError): string {
  if (err.kind === 'rate_limited') return "You're posting too fast. Try again later."
  if (err.kind === 'invalid_input') {
    if (err.fields?.text === 'over_redacted') {
      return 'Most of what you wrote was redacted for privacy. Edit and re-preview.'
    }
    const firstField = err.fields ? Object.keys(err.fields)[0] : undefined
    if (firstField !== undefined) return `Check the ${firstField.replace('_', ' ')} field.`
    return 'Some fields are invalid. Edit and try again.'
  }
  if (err.kind === 'unauthorized') return 'Your session expired. Refresh and try again.'
  return 'Something went wrong. Try again.'
}
