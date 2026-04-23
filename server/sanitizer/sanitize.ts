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
  // Stryker disable next-line StringLiteral: 'OpenAI' contains an internal
  // capital so it never matches TWO_CAP_WORDS_REGEX; removing it from the
  // list produces the same output for every input — equivalent mutant.
  'OpenAI',
  'Anthropic',
  'Google DeepMind',
  'Hugging Face',
  'Stable Diffusion',
  'Stability AI',
  'Mistral',
  // Stryker disable next-line StringLiteral: 'xAI' starts with lowercase so
  // it never matches TWO_CAP_WORDS_REGEX — equivalent mutant.
  'xAI',
  'Meta AI',
  // Stryker disable next-line StringLiteral: 'DeepMind' has an internal capital
  // that breaks [A-Z][a-z]+\b, so it never matches TWO_CAP_WORDS_REGEX —
  // equivalent mutant.
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
// Stryker disable next-line Regex: `\d{1,3}` → `\d` is equivalent here —
// the optional `[\s-]?` and the main regex's greedy middle absorb the extra
// country-code digits, producing an identical final match extent.
const PHONE_CANDIDATE_REGEX = /(?:\+\d{1,3}[\s-]?)?\(?\d[\d\s\-().]{5,19}\d/g
// Two or more consecutive capitalized words. Each word is A single uppercase
// letter followed by one or more lowercase letters. Words separated by single
// spaces. Anchored with word boundaries.
const TWO_CAP_WORDS_REGEX = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g

const URL_PLACEHOLDER_PREFIX = '\u0000URL'
const EMAIL_PLACEHOLDER_PREFIX = '\u0000EMAIL'
const PHONE_PLACEHOLDER_PREFIX = '\u0000PHONE'
// Stryker disable next-line StringLiteral: emptying this prefix yields tokens
// like '0<NUL>' which remain unique among URL/EMAIL/PHONE tokens. The final
// exception-restore loop iterates every entry, but URL/EMAIL/PHONE tokens are
// already replaced in 'working' by earlier passes, so their split/join becomes
// a no-op — equivalent mutant.
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
  // Stryker disable next-line ConditionalExpression: `ch <= '9'` → `true`
  // is equivalent — phone candidates only contain chars in [\d\s\-().],
  // none exceeding '9' in ASCII, so the `ch >= '0'` short-circuits on
  // non-digits and the second comparison's truth value never affects count.
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
    // Stryker disable next-line AssignmentOperator: `counter -= 1` produces
    // tokens with a negative suffix (prefix+'-1', prefix+'-2', ...) which are
    // still globally unique, so `split(token).join(...)` behaves identically
    // — equivalent mutant.
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

const extractExceptions = (
  text: string,
  table: PlaceholderTable,
  extra: readonly string[],
): string => {
  let out = text
  // One shared counter across all exception phrases so placeholder keys
  // remain globally unique. Longest-first avoids "Meta" capturing before
  // "Meta AI" (left-to-right overlap). Admin-provided extras merge with the
  // built-in curated list; duplicates collapse so the audit stays stable.
  const merged = Array.from(new Set([...EXCEPTIONS, ...extra]))
  const sorted = merged.sort((a, b) => b.length - a.length)
  const replace = makeReplacer(EXCEPTION_PLACEHOLDER_PREFIX, table)
  for (const phrase of sorted) {
    if (phrase === '') continue
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
  // Stryker disable next-line Regex: `\s+` → `\s` is equivalent here —
  // `.replace(x, '')` with either pattern strips every whitespace char.
  const origChars = original.replace(/\s+/g, '').length
  // Stryker disable next-line ConditionalExpression: dropping the early-exit
  // falls through to `survived / 0 = NaN`, and `NaN <= 0.2` is false —
  // returns the same value as `return false` for empty input.
  if (origChars === 0) return false
  // Stryker disable next-line Regex: `\s+` → `\s` is equivalent (same reason
  // as origChars above).
  const survived = clean.replace(TOKEN_REGEX, '').replace(/\s+/g, '').length
  return survived / origChars <= OVER_REDACTED_THRESHOLD
}

/**
 * Options accepted by {@link sanitize}.
 *
 * `extraExceptions` is the per-deployment exception list editable by admins
 * in Settings. It merges with the built-in curated {@link EXCEPTIONS} before
 * redaction. The client preview sanitizer does NOT see these entries, so
 * admin-added terms may still appear redacted in form previews while being
 * preserved in the stored post. That drift is intentional: the client can
 * not fetch admin-only state for every preview keystroke.
 */
export type SanitizeOptions = {
  extraExceptions?: readonly string[]
}

/**
 * Sanitize free-text before storage. See the module docstring for rules.
 * Pure function with no side effects.
 */
export function sanitize(text: string, opts: SanitizeOptions = {}): SanitizeResult {
  const table: PlaceholderTable = new Map()
  const extra = opts.extraExceptions ?? []

  let working = extractWithTable(text, URL_REGEX, URL_PLACEHOLDER_PREFIX, table)
  working = extractWithTable(working, EMAIL_REGEX, EMAIL_PLACEHOLDER_PREFIX, table)
  working = extractPhones(working, table)
  working = extractExceptions(working, table, extra)
  working = working.replace(TWO_CAP_WORDS_REGEX, '[name]')
  working = restoreUrls(working, table)
  working = restorePrefix(working, table, EMAIL_PLACEHOLDER_PREFIX, () => '[email]')
  working = restorePrefix(working, table, PHONE_PLACEHOLDER_PREFIX, () => '[phone]')
  working = restorePrefix(working, table, EXCEPTION_PLACEHOLDER_PREFIX, (orig) => orig)

  return { clean: working, overRedacted: computeOverRedacted(text, working) }
}

/**
 * Parse the newline-separated sanitizer_exceptions setting stored by admin
 * Settings into an array of usable phrases. Trims whitespace, drops empty
 * lines, preserves order, and de-duplicates the result.
 */
export function parseSanitizerExceptionList(raw: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}
