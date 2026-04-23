// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isValidIsoDate } from './iso-date.js'

/**
 * Pin the calendar round-trip so a naive regex refactor can't accept
 * impossible dates. Three callers (agents, reports, admin takedowns)
 * depend on this — all of them store values the admin or agent can't
 * easily correct once saved.
 */
describe('isValidIsoDate', () => {
  it('accepts well-formed dates', () => {
    expect(isValidIsoDate('2026-04-23')).toBe(true)
    expect(isValidIsoDate('1999-01-01')).toBe(true)
  })

  it('accepts Feb 29 on leap years', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true)
  })

  it('rejects Feb 29 on non-leap years', () => {
    expect(isValidIsoDate('2025-02-29')).toBe(false)
  })

  it('rejects impossible month/day like 2026-13-40', () => {
    expect(isValidIsoDate('2026-13-40')).toBe(false)
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('2026-00-10')).toBe(false)
    expect(isValidIsoDate('2026-04-00')).toBe(false)
  })

  it('rejects non-YYYY-MM-DD formats', () => {
    expect(isValidIsoDate('2026/04/23')).toBe(false)
    expect(isValidIsoDate('2026-4-23')).toBe(false)
    expect(isValidIsoDate('April 23, 2026')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('2026-04-23T00:00:00Z')).toBe(false)
  })
})
