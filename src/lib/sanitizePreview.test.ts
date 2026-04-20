import { describe, it, expect } from 'vitest'

import { sanitize } from '@/lib/sanitizePreview'

describe('sanitizePreview — client mirror of server sanitizer', () => {
  it('redacts two consecutive capitalized words', () => {
    expect(sanitize('Sam Altman mentioned me in his keynote').clean).toBe(
      '[name] mentioned me in his keynote',
    )
  })

  it('preserves an allowlisted URL and redacts a non-allowlisted one', () => {
    expect(
      sanitize('See https://arxiv.org/abs/2305.12345 and https://myblog.com/post').clean,
    ).toBe('See https://arxiv.org/abs/2305.12345 and [link]')
  })

  it('redacts email addresses and phone numbers', () => {
    expect(sanitize('Contact me at user@example.com').clean).toBe('Contact me at [email]')
    expect(sanitize('Call +1 415-555-2671 any time').clean).toBe('Call [phone] any time')
  })

  it('is idempotent on already-sanitized text', () => {
    const first = sanitize('Sam Altman emailed hi@foo.com from https://someblog.example').clean
    expect(first).toBe('[name] emailed [email] from [link]')
    expect(sanitize(first).clean).toBe(first)
  })

  it('flags over-redaction when surviving content is ≤ 20%', () => {
    const r = sanitize('John Smith Mary Jones')
    expect(r.clean).toBe('[name]')
    expect(r.overRedacted).toBe(true)
  })
})
