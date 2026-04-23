/**
 * Golden-input parity fixture for the sanitizer.
 *
 * The sanitizer is implemented twice (once on the server in `sanitize.ts`, once
 * on the client in `src/lib/sanitizePreview.ts`) so the preview screen can show
 * exactly what will be stored without dragging the server module into the
 * browser bundle. Both copies MUST produce identical output for every input.
 *
 * This file is the single source of truth for that parity claim. It is loaded
 * by both `server/sanitizer/sanitize.test.ts` and
 * `src/lib/sanitizePreview.test.ts`. When you add a sanitizer rule, add a case
 * here and both test suites will exercise it. If only one side is updated,
 * BOTH suites will fail until parity is restored.
 */

/** A single sanitizer parity case: input plus the expected outcome on both sides. */
export interface SanitizerParityCase {
  /** Human-readable label used in the test description. */
  name: string
  /** Free-text submitted by a user. */
  input: string
  /** Expected `clean` field after sanitisation. */
  expectedClean: string
  /** Expected `overRedacted` flag after sanitisation. */
  expectedOverRedacted: boolean
}

/**
 * Cases iterated by both the server and client sanitizer test suites. Cover
 * one example per active redaction rule plus the over-redaction threshold and
 * idempotence — a regression on either runtime fails both files at once.
 */
export const SANITIZER_PARITY_CASES: readonly SanitizerParityCase[] = [
  {
    name: 'redacts two consecutive capitalized words',
    input: 'Sam Altman left the letter signatories',
    expectedClean: '[name] left the letter signatories',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves a single capitalized word',
    input: 'I used Claude to fine-tune a model',
    expectedClean: 'I used Claude to fine-tune a model',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves curated multi-word exception (Hugging Face)',
    input: 'I donated to Hugging Face',
    expectedClean: 'I donated to Hugging Face',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves curated multi-word exception (Google DeepMind)',
    input: 'Google DeepMind announced something',
    expectedClean: 'Google DeepMind announced something',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves allowlisted URL (arxiv.org)',
    input: 'See https://arxiv.org/abs/2305.12345',
    expectedClean: 'See https://arxiv.org/abs/2305.12345',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves .ai-suffix host',
    input: 'Check https://anthropic.ai/news here',
    expectedClean: 'Check https://anthropic.ai/news here',
    expectedOverRedacted: false,
  },
  {
    name: 'redacts non-allowlisted URL to [link]',
    // Padded with surrounding plain text so the [link] replacement does not
    // by itself trip the over-redaction threshold — this case is about the
    // URL-allowlist behaviour, not the threshold.
    input: 'I read about it on https://someblog.example/post the other morning quietly',
    expectedClean: 'I read about it on [link] the other morning quietly',
    expectedOverRedacted: false,
  },
  {
    name: 'mixes allowlisted and non-allowlisted URLs',
    input: 'See https://arxiv.org/abs/2305.12345 and https://myblog.com/post',
    expectedClean: 'See https://arxiv.org/abs/2305.12345 and [link]',
    expectedOverRedacted: false,
  },
  {
    name: 'redacts email addresses',
    input: 'Contact me at user@example.com',
    expectedClean: 'Contact me at [email]',
    expectedOverRedacted: false,
  },
  {
    name: 'redacts phone numbers with country code + separators',
    input: 'Call +1 415-555-2671 any time',
    expectedClean: 'Call [phone] any time',
    expectedOverRedacted: false,
  },
  {
    name: 'redacts US phone numbers in (NPA) NXX-XXXX form',
    input: 'My number is (212) 555-0199',
    expectedClean: 'My number is [phone]',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves short numeric runs that are not phones',
    input: 'I paid $20 in 2022 for the plan',
    expectedClean: 'I paid $20 in 2022 for the plan',
    expectedOverRedacted: false,
  },
  {
    name: 'over-redaction threshold trips on near-total redaction',
    input: 'John Smith Mary Jones',
    expectedClean: '[name]',
    expectedOverRedacted: true,
  },
  {
    name: 'over-redaction does not trip when most content survives',
    input: 'I paid for a Pro subscription every month since 2022 to support progress',
    expectedClean: 'I paid for a Pro subscription every month since 2022 to support progress',
    expectedOverRedacted: false,
  },
  {
    name: 'idempotent: combined rules collapse cleanly',
    input: 'Sam Altman emailed hi@foo.com from https://someblog.example',
    expectedClean: '[name] emailed [email] from [link]',
    expectedOverRedacted: false,
  },
  {
    name: 'preserves single-word exception adjacent to redacted name',
    input: 'Sam Altman joined OpenAI in 2019',
    expectedClean: '[name] joined OpenAI in 2019',
    expectedOverRedacted: false,
  },
  {
    name: 'does not redact compound-cap technical terms (GitHub, H100)',
    input: 'I wrote GitHub actions for an H100 cluster',
    expectedClean: 'I wrote GitHub actions for an H100 cluster',
    expectedOverRedacted: false,
  },
  {
    name: 'URL extracted before cap-word pass — text inside URL is preserved',
    input: 'See Sam Altman at https://arxiv.org/abs/1234 and Foo Bar elsewhere',
    expectedClean: '[name] at https://arxiv.org/abs/1234 and [name] elsewhere',
    expectedOverRedacted: false,
  },
]
