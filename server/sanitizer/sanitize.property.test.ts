// @vitest-environment node
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { EXCEPTIONS, parseSanitizerExceptionList, sanitize } from './sanitize.js'

// Arbitrary for "boring" free text that contains no URLs, emails, phones,
// bracket placeholders, or two-consecutive-capitalized-words runs. Such text
// is a fixed point of sanitize(): output equals input, overRedacted is false.
const plainLower = fc
  .stringMatching(/^[a-z][a-z ]{0,80}[a-z]$/)
  .filter((s) => !/ {2,}/.test(s))

// Word-boundary-safe wrapper: plain lowercase ASCII with exactly one space.
const fillerWord = fc.stringMatching(/^[a-z]{1,10}$/)

describe('sanitize — property: idempotence', () => {
  it('sanitize(sanitize(x)) === sanitize(x) for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const once = sanitize(text).clean
        const twice = sanitize(once).clean
        expect(twice).toBe(once)
      }),
      { numRuns: 300 },
    )
  })

  it('sanitize is idempotent for unicode-heavy input', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 120 }), (text) => {
        const once = sanitize(text).clean
        const twice = sanitize(once).clean
        expect(twice).toBe(once)
      }),
      { numRuns: 200 },
    )
  })
})

describe('sanitize — property: fixed points', () => {
  it('lowercase-only ASCII text passes through unchanged', () => {
    fc.assert(
      fc.property(plainLower, (text) => {
        const { clean, overRedacted } = sanitize(text)
        expect(clean).toBe(text)
        expect(overRedacted).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('curated exception phrases are preserved verbatim when surrounded by filler', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXCEPTIONS),
        fillerWord,
        fillerWord,
        (phrase, before, after) => {
          const input = `${before} ${phrase} ${after}`
          expect(sanitize(input).clean).toBe(input)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('allowlisted URL hosts survive intact', () => {
    // Mirror the actual `URL_ALLOWLIST` in sanitize.ts. Covering every
    // entry prevents regressions where a host is silently dropped (or a
    // new entry sneaks in without being exercised here).
    const allowlistedUrl = fc.oneof(
      fc
        .stringMatching(/^[a-z0-9]{1,20}$/)
        .map((slug) => `https://arxiv.org/abs/${slug}`),
      fc
        .stringMatching(/^[a-z0-9]{1,20}$/)
        .map((slug) => `https://github.com/u/${slug}`),
      fc
        .stringMatching(/^[a-z0-9]{1,20}$/)
        .map((slug) => `https://huggingface.co/${slug}`),
      fc
        .stringMatching(/^[a-z0-9]{1,20}$/)
        .map((slug) => `https://openreview.net/forum?id=${slug}`),
    )
    fc.assert(
      fc.property(fillerWord, allowlistedUrl, fillerWord, (before, url, after) => {
        const input = `${before} ${url} ${after}`
        expect(sanitize(input).clean).toBe(input)
      }),
      { numRuns: 200 },
    )
  })

  it('short digit runs (≤6 digits) are not redacted to [phone]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999_999 }).map((n) => String(n)),
        (digits) => {
          const input = `order ${digits} shipped`
          expect(sanitize(input).clean).toBe(input)
        },
      ),
      { numRuns: 150 },
    )
  })
})

describe('parseSanitizerExceptionList — property', () => {
  it('result never contains empty strings', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(parseSanitizerExceptionList(raw).every((line) => line.length > 0)).toBe(true)
      }),
    )
  })

  it('result is de-duplicated', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const out = parseSanitizerExceptionList(raw)
        expect(new Set(out).size).toBe(out.length)
      }),
    )
  })

  it('joining with "\\n" then re-parsing returns the same list', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .stringMatching(/^[^\n\r]{1,40}$/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
          { maxLength: 20 },
        ),
        (lines) => {
          const unique = Array.from(new Set(lines))
          const roundTrip = parseSanitizerExceptionList(unique.join('\n'))
          expect(roundTrip).toEqual(unique)
        },
      ),
    )
  })
})
