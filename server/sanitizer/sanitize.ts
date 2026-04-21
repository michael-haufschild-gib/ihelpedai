/**
 * Text sanitizer implementing PRD 01 Story 9.
 *
 * Rules (applied in this effective order):
 *   1. URLs are extracted first. Allowlisted hosts are preserved; others become [link].
 *   2. Emails become [email].
 *   3. Phone-number patterns (7–15 digits with optional separators and country code)
 *      become [phone].
 *   4. Curated exception phrases (org and product names) are preserved verbatim.
 *   5. Any remaining sequence of two or more consecutive capitalized words
 *      (First letter upper, rest lower) is replaced with [name]. Single
 *      capitalized words are preserved.
 *
 * Idempotent: re-running on already-sanitized text produces the same output.
 * If the surviving non-whitespace, non-token characters are ≤ 20% of the
 * original non-whitespace characters, the result is flagged over-redacted.
 */

/**
 * Curated exception list. Preserved verbatim, case-sensitively, even when
 * they would otherwise match the two-capitalized-words rule. Edit this list
 * to add or remove server-side protected terms; no redeploy semantics are
 * required beyond a process restart.
 */
export const EXCEPTIONS: readonly string[] = [
  'Claude',
  'OpenAI',
  'Anthropic',
  'Google DeepMind',
  'Hugging Face',
  'Stable Diffusion',
  'Stability AI',
  'Mistral',
  'xAI',
  'Meta AI',
  'DeepMind',
  'Cohere',
  'Nvidia',
]

/** Host suffix allowlist for URL preservation. A host is allowed if it equals or ends with any of these. */
const URL_ALLOWLIST: readonly string[] = [
  'arxiv.org',
  'github.com',
  'huggingface.co',
  'openreview.net',
]

const URL_REGEX = /https?:\/\/[^\s<>"']+/g
const EMAIL_REGEX = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// Phone candidates: optional country code (+ and digits), optional opening paren,
// then runs of digits and separators. Post-filter keeps only matches with a
// bare digit count in [7,15].
const PHONE_CANDIDATE_REGEX = /(?:\+\d{1,3}[\s-]?)?\(?\d[\d\s\-().]{5,19}\d/g
// Two or more consecutive capitalized words. Each word is A single uppercase
// letter followed by one or more lowercase letters. Words separated by single
// spaces. Anchored with word boundaries.
const TWO_CAP_WORDS_REGEX = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g

const URL_PLACEHOLDER_PREFIX = '\u0000URL'
const EMAIL_PLACEHOLDER_PREFIX = '\u0000EMAIL'
const PHONE_PLACEHOLDER_PREFIX = '\u0000PHONE'
const EXCEPTION_PLACEHOLDER_PREFIX = '\u0000EXC'
const PLACEHOLDER_SUFFIX = '\u0000'

/**
 * Result of sanitizing a piece of text.
 */
export type SanitizeResult = {
  clean: string
  overRedacted: boolean
}

type PlaceholderTable = Map<string, string>

const countDigits = (s: string): number => {
  let n = 0
  for (const ch of s) if (ch >= '0' && ch <= '9') n += 1
  return n
}

const isAllowlistedHost = (host: string): boolean => {
  const h = host.toLowerCase()
  if (h.endsWith('.ai')) return true
  return URL_ALLOWLIST.some((allowed) => h === allowed || h.endsWith(`.${allowed}`))
}

const urlHost = (url: string): string | null => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

const makeReplacer = (prefix: string, table: PlaceholderTable) => {
  let counter = 0
  return (match: string): string => {
    const token = `${prefix}${counter}${PLACEHOLDER_SUFFIX}`
    counter += 1
    table.set(token, match)
    return token
  }
}

const extractWithTable = (
  text: string,
  regex: RegExp,
  prefix: string,
  table: PlaceholderTable,
): string => text.replace(regex, makeReplacer(prefix, table))

const extractPhones = (text: string, table: PlaceholderTable): string => {
  const replace = makeReplacer(PHONE_PLACEHOLDER_PREFIX, table)
  return text.replace(PHONE_CANDIDATE_REGEX, (match) => {
    const digits = countDigits(match)
    if (digits < 7 || digits > 15) return match
    return replace(match)
  })
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractExceptions = (text: string, table: PlaceholderTable): string => {
  let out = text
  // One shared counter across all exception phrases so placeholder keys
  // remain globally unique. Longest-first avoids "Meta" capturing before
  // "Meta AI" (left-to-right overlap).
  const sorted = [...EXCEPTIONS].sort((a, b) => b.length - a.length)
  const replace = makeReplacer(EXCEPTION_PLACEHOLDER_PREFIX, table)
  for (const phrase of sorted) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'g')
    out = out.replace(re, replace)
  }
  return out
}

const restoreUrls = (text: string, table: PlaceholderTable): string => {
  let out = text
  for (const [token, original] of table) {
    if (!token.startsWith(URL_PLACEHOLDER_PREFIX)) continue
    const host = urlHost(original)
    const replacement = host !== null && isAllowlistedHost(host) ? original : '[link]'
    out = out.split(token).join(replacement)
  }
  return out
}

const restorePrefix = (
  text: string,
  table: PlaceholderTable,
  prefix: string,
  replacement: (original: string) => string,
): string => {
  let out = text
  for (const [token, original] of table) {
    if (!token.startsWith(prefix)) continue
    out = out.split(token).join(replacement(original))
  }
  return out
}

const TOKEN_REGEX = /\[(?:name|email|phone|link)\]/g

/** Text is over-redacted when non-placeholder survivors fall to or below this fraction of the original. Must match the client's threshold in `src/lib/sanitizePreview.ts`. */
export const OVER_REDACTED_THRESHOLD = 0.2

const computeOverRedacted = (original: string, clean: string): boolean => {
  const origChars = original.replace(/\s+/g, '').length
  if (origChars === 0) return false
  const survived = clean.replace(TOKEN_REGEX, '').replace(/\s+/g, '').length
  return survived / origChars <= OVER_REDACTED_THRESHOLD
}

/**
 * Sanitize free-text before storage. See the module docstring for rules.
 * Pure function with no side effects.
 */
export function sanitize(text: string): SanitizeResult {
  const table: PlaceholderTable = new Map()

  let working = extractWithTable(text, URL_REGEX, URL_PLACEHOLDER_PREFIX, table)
  working = extractWithTable(working, EMAIL_REGEX, EMAIL_PLACEHOLDER_PREFIX, table)
  working = extractPhones(working, table)
  working = extractExceptions(working, table)
  working = working.replace(TWO_CAP_WORDS_REGEX, '[name]')
  working = restoreUrls(working, table)
  working = restorePrefix(working, table, EMAIL_PLACEHOLDER_PREFIX, () => '[email]')
  working = restorePrefix(working, table, PHONE_PLACEHOLDER_PREFIX, () => '[phone]')
  working = restorePrefix(working, table, EXCEPTION_PLACEHOLDER_PREFIX, (orig) => orig)

  return { clean: working, overRedacted: computeOverRedacted(text, working) }
}
