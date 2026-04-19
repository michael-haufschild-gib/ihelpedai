import { describe, it, expect } from 'vitest'

import { sanitize, EXCEPTIONS } from './sanitize.js'

describe('sanitize — Story 9 rules', () => {
  it('redacts two consecutive capitalized words', () => {
    expect(sanitize('Sam Altman left the letter signatories').clean).toBe(
      '[name] left the letter signatories',
    )
  })

  it('preserves a single capitalized word', () => {
    expect(sanitize('I used Claude to fine-tune a model').clean).toBe(
      'I used Claude to fine-tune a model',
    )
  })

  it('preserves curated exception phrases including multi-word ones', () => {
    expect(sanitize('I donated to Hugging Face').clean).toBe('I donated to Hugging Face')
    expect(sanitize('Google DeepMind announced something').clean).toBe(
      'Google DeepMind announced something',
    )
    expect(sanitize('A Stable Diffusion release from Stability AI').clean).toBe(
      'A Stable Diffusion release from Stability AI',
    )
  })

  it('preserves allowlisted URLs', () => {
    expect(sanitize('See https://arxiv.org/abs/2305.12345').clean).toBe(
      'See https://arxiv.org/abs/2305.12345',
    )
  })

  it('preserves .ai hosts by suffix rule', () => {
    expect(sanitize('Check https://anthropic.ai/news here').clean).toBe(
      'Check https://anthropic.ai/news here',
    )
    expect(sanitize('Sub.example.ai works too: https://sub.example.ai/x').clean).toBe(
      'Sub.example.ai works too: https://sub.example.ai/x',
    )
  })

  it('redacts non-allowlisted URLs to [link]', () => {
    expect(sanitize('See https://someblog.example/post').clean).toBe('See [link]')
  })

  it('mixes allowlisted and non-allowlisted URLs correctly', () => {
    expect(
      sanitize('See https://arxiv.org/abs/2305.12345 and https://myblog.com/post').clean,
    ).toBe('See https://arxiv.org/abs/2305.12345 and [link]')
  })

  it('redacts email addresses', () => {
    expect(sanitize('Contact me at user@example.com').clean).toBe('Contact me at [email]')
  })

  it('redacts phone numbers with separators', () => {
    expect(sanitize('Call +1 415-555-2671 any time').clean).toBe('Call [phone] any time')
    expect(sanitize('My number is (212) 555-0199').clean).toBe('My number is [phone]')
  })

  it('does not redact short numeric runs that are not phones', () => {
    expect(sanitize('I paid $20 in 2022 for the plan').clean).toBe(
      'I paid $20 in 2022 for the plan',
    )
  })

  it('joins four consecutive capitalized words as a single [name]', () => {
    expect(sanitize('John Smith Mary Jones').clean).toBe('[name]')
  })

  it('is idempotent: running again on sanitized output is unchanged', () => {
    const first = sanitize('Sam Altman emailed hi@foo.com from https://someblog.example').clean
    const second = sanitize(first).clean
    expect(second).toBe(first)
    expect(first).toBe('[name] emailed [email] from [link]')
    expect(sanitize('[name] said').clean).toBe('[name] said')
  })

  it('flags over-redaction when surviving content is ≤ 20%', () => {
    const result = sanitize('John Smith Mary Jones')
    expect(result.clean).toBe('[name]')
    expect(result.overRedacted).toBe(true)
  })

  it('does not flag over-redaction when most content survives', () => {
    const result = sanitize(
      'I paid for a Pro subscription every month since 2022 to support progress',
    )
    expect(result.overRedacted).toBe(false)
    expect(result.clean).toBe(
      'I paid for a Pro subscription every month since 2022 to support progress',
    )
  })

  it('handles the over-redaction boundary precisely', () => {
    // Original non-whitespace chars: "SamAltmanabc" = 12. Clean: "[name] abc" → strip tokens → "abc" = 3 chars.
    // 3/12 = 25% → NOT over-redacted.
    expect(sanitize('Sam Altman abc').overRedacted).toBe(false)
    // Original: "SamAltmana" = 10. Clean tokens stripped: "a" = 1. 1/10 = 10% → over-redacted.
    expect(sanitize('Sam Altman a').overRedacted).toBe(true)
  })

  it('empty input is not over-redacted', () => {
    expect(sanitize('').overRedacted).toBe(false)
    expect(sanitize('   ').overRedacted).toBe(false)
  })

  it('applies sanitizer to names mixed with exception list terms', () => {
    // "Sam Altman" redacts, "OpenAI" preserved as single-word exception.
    expect(sanitize('Sam Altman joined OpenAI in 2019').clean).toBe(
      '[name] joined OpenAI in 2019',
    )
  })

  it('redacts multi-cap name sequences at start and end', () => {
    expect(sanitize('Sam Altman').clean).toBe('[name]')
    // PRD rule is mechanical: 2+ adjacent cap words collapse into one [name],
    // so an English capital like "Yesterday" adjacent to a name is absorbed.
    // A comma breaks the adjacency.
    expect(sanitize('Yesterday, John Paul Jones spoke').clean).toBe('Yesterday, [name] spoke')
  })

  it('preserves URL even if surrounding text would match 2-cap rule', () => {
    // URLs are extracted before the cap-word pass, so the 2-cap match at
    // "Sam Altman" does not reach into the URL. "See" is capitalized so it
    // gets absorbed into the adjacent name run per the mechanical rule.
    expect(
      sanitize('See Sam Altman at https://arxiv.org/abs/1234 and Foo Bar elsewhere').clean,
    ).toBe('[name] at https://arxiv.org/abs/1234 and [name] elsewhere')
  })

  it('every exported exception is preserved', () => {
    for (const phrase of EXCEPTIONS) {
      expect(sanitize(`Before ${phrase} after`).clean).toBe(`Before ${phrase} after`)
    }
  })

  it('does not redact single capitalized words like GitHub or H100', () => {
    expect(sanitize('I wrote GitHub actions for an H100 cluster').clean).toBe(
      'I wrote GitHub actions for an H100 cluster',
    )
  })
})
