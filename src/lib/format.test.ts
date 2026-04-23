import { describe, expect, it } from 'vitest'

import { countryLabel, formatDate } from './format'

describe('countryLabel', () => {
  it('resolves a known ISO 3166-1 alpha-2 code to its name', () => {
    expect(countryLabel('US')).toBe('United States')
  })

  it('returns the code verbatim when no match is found', () => {
    expect(countryLabel('ZZ')).toBe('ZZ')
  })

  it('is case-sensitive — lowercased codes do not resolve', () => {
    // Intentional: the ISO list stores canonical uppercase keys; matching
    // case-insensitively would hide upstream bugs that emit lowercased codes.
    expect(countryLabel('us')).toBe('us')
  })
})

describe('formatDate', () => {
  it('formats a valid ISO-8601 datetime as YYYY-MM-DD (UTC)', () => {
    expect(formatDate('2026-04-23T10:15:30Z')).toBe('2026-04-23')
  })

  it('normalises a timestamp past midnight UTC forward by one day', () => {
    // 23:30 UTC on the 22nd stays the 22nd; 00:30 on the 23rd becomes the 23rd.
    expect(formatDate('2026-04-22T23:30:00Z')).toBe('2026-04-22')
    expect(formatDate('2026-04-23T00:30:00Z')).toBe('2026-04-23')
  })

  it('falls back to the leading 10 chars for a malformed input', () => {
    // Garbage-in: preserve the leading YYYY-MM-DD so the UI still shows
    // something reasonable instead of "Invalid Date".
    expect(formatDate('2026-04-23-garbage')).toBe('2026-04-23')
  })

  it('normalises an offset-bearing timestamp into UTC before slicing', () => {
    // 23:30 on the 22nd at -08:00 is 07:30 UTC on the 23rd. formatDate
    // is "UTC calendar" so the returned string is the UTC-day, not the
    // submitter's local day. Without this anchor, a refactor using
    // getDate()/getMonth() could silently drift to the viewer's local TZ.
    expect(formatDate('2026-04-22T23:30:00-08:00')).toBe('2026-04-23')
  })
})
