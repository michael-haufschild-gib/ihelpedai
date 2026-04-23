// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { sanitize } from './sanitize.js'

// Each test below differentiates a specific Stryker mutant. Comments name the
// mutation being killed so future readers know why the assertion is so precise.

describe('sanitize — exception preservation kills', () => {
  // Removing an exception from EXCEPTIONS only changes output when the phrase,
  // left unprotected, is captured by TWO_CAP_WORDS_REGEX. Pair each cap-word
  // exception with a neighbour that triggers the 2-cap rule.

  it('Claude is preserved next to a second capitalized word', () => {
    // Without exception: 'Sam Claude Joe' → [name]; with: 'Sam Claude Joe' kept.
    expect(sanitize('Sam Claude Joe').clean).toBe('Sam Claude Joe')
  })

  it('Anthropic is preserved next to a second capitalized word', () => {
    expect(sanitize('Anthropic Lab').clean).toBe('Anthropic Lab')
  })

  it('Hugging Face is preserved as a 2-cap match candidate', () => {
    // Without exception: 'Hugging Face' → [name]; with: preserved.
    expect(sanitize('Hugging Face team').clean).toBe('Hugging Face team')
  })

  it('Stable Diffusion is preserved as a 2-cap match candidate', () => {
    expect(sanitize('Stable Diffusion release').clean).toBe('Stable Diffusion release')
  })

  it('Mistral is preserved next to a second capitalized word', () => {
    expect(sanitize('Mistral Labs').clean).toBe('Mistral Labs')
  })

  it('Cohere is preserved next to a second capitalized word', () => {
    expect(sanitize('Cohere Research').clean).toBe('Cohere Research')
  })

  it('Nvidia is preserved next to a second capitalized word', () => {
    expect(sanitize('Nvidia Research').clean).toBe('Nvidia Research')
  })

  it('Google DeepMind is preserved when surrounding cap words would merge', () => {
    // Without exception: 'Alpha Google DeepMind Sam' → 'Alpha Google' matches 2-cap
    // (DeepMind breaks [A-Z][a-z]+\b), so output becomes '[name] DeepMind Sam'.
    // With exception: placeholder splits, '[Alpha]' alone, 'Sam' alone → preserved.
    expect(sanitize('Alpha Google DeepMind Sam').clean).toBe('Alpha Google DeepMind Sam')
  })

  it('Stability AI is preserved when surrounding cap words would merge', () => {
    // Without exception: 'Research Stability' becomes [name]; with, placeholder splits.
    expect(sanitize('Research Stability AI team').clean).toBe('Research Stability AI team')
  })

  it('Meta AI is preserved when surrounding cap words would merge', () => {
    expect(sanitize('Research Meta AI launched').clean).toBe('Research Meta AI launched')
  })
})

describe('sanitize — URL allowlist kills', () => {
  it('preserves huggingface.co URLs', () => {
    // Mutating URL_ALLOWLIST entry 'huggingface.co' → '' would drop this host.
    expect(sanitize('model at https://huggingface.co/models/foo here').clean).toBe(
      'model at https://huggingface.co/models/foo here',
    )
  })

  it('preserves openreview.net URLs', () => {
    expect(sanitize('paper on https://openreview.net/forum?id=abc here').clean).toBe(
      'paper on https://openreview.net/forum?id=abc here',
    )
  })

  it('preserves subdomain of github.com (endsWith, not startsWith)', () => {
    // Kills MethodExpression line 85: endsWith(`.${allowed}`) → startsWith(...).
    // 'api.github.com' strictly ends-with '.github.com' but doesn't start-with it.
    expect(sanitize('fetch https://api.github.com/users/x').clean).toBe(
      'fetch https://api.github.com/users/x',
    )
  })
})

describe('sanitize — URL/email/phone regex kills', () => {
  it('redacts http:// (non-TLS) non-allowlisted URLs', () => {
    // Kills URL_REGEX mutation: https? → https (drops http scheme).
    expect(sanitize('See http://someblog.example/post here').clean).toBe('See [link] here')
  })

  it('fully redacts multi-segment email domains', () => {
    // Kills EMAIL_REGEX mutation: (?:\.[\w-]+)+ → (?:\.[\w-]+) (loses the + quantifier).
    // Mutation match would be 'user@foo.example' → '[email].com' — ours eats the whole thing.
    expect(sanitize('Contact user@foo.example.com today').clean).toBe('Contact [email] today')
  })

  it('extracts a phone number attached to a country code with no separator', () => {
    // Kills PHONE_REGEX mutation: [\s-]? → [\s-] (sep becomes required).
    // With required sep, '+12345678' fails country path; main-only matches '12345678',
    // leaving '+' untouched. Intended behavior: include the leading '+'.
    expect(sanitize('Call +12345678 now').clean).toBe('Call [phone] now')
  })
})

describe('sanitize — digit / phone boundary kills', () => {
  it('extracts exactly 7 digits (lower boundary)', () => {
    // Kills digit range mutation: `digits < 7 || digits > 15` → `digits <= 7`.
    expect(sanitize('call 1234567 today').clean).toBe('call [phone] today')
  })

  it('extracts exactly 15 digits (upper boundary)', () => {
    // Kills digit range mutation: `digits < 7 || digits > 15` → `digits >= 15`.
    expect(sanitize('call 123456789012345 today').clean).toBe('call [phone] today')
  })

  it('rejects a 6-digit candidate even though the regex matches the shape', () => {
    // Kills digit range mutation to always-accept: `digits < 7 || digits > 15` → `false`.
    // '12-34-56' matches PHONE_CANDIDATE_REGEX but has only 6 digits → stay.
    expect(sanitize('code 12-34-56 here').clean).toBe('code 12-34-56 here')
  })

  it('extracts phones with zero-heavy digit runs', () => {
    // Kills countDigits mutation: `ch >= '0'` → `ch > '0'` (skips '0's).
    // '1000002' has 7 digits total but only 2 non-zero. Original: 7 ≥ 7 → extract.
    // Mutation: 2 < 7 → skip, output retains the number.
    expect(sanitize('code 1000002 here').clean).toBe('code [phone] here')
  })

  it('extracts phones with nine-heavy digit runs', () => {
    // Kills countDigits mutation: `ch <= '9'` → `ch < '9'` (skips '9's).
    // '9999991' has 7 digits, only 1 non-nine. Same kill shape as zeros above.
    expect(sanitize('code 9999991 here').clean).toBe('code [phone] here')
  })

  it('rejects long phone candidates whose digit count exceeds 15', () => {
    // Kills countDigits mutation at line 78 col 27 (`ch >= '0' && ch <= '9'` → `true`):
    // mutation counts string length. '+1 (555) 123-4567' has 11 digits but 17 chars;
    // if length is counted, 17 > 15 → skip extraction.
    expect(sanitize('Call +1 (555) 123-4567 today').clean).toBe('Call [phone] today')
  })

  it('rejects a 17-digit candidate that exceeds the upper bound', () => {
    // Kills line 117 col 23 ConditionalExpression (`digits > 15` → `false`):
    // with that branch disabled, the reject condition collapses to `digits < 7`,
    // so a 17-digit run is wrongly extracted. Original: 17 > 15 → leave as-is.
    expect(sanitize('xx 12345678901234567 yy').clean).toBe('xx 12345678901234567 yy')
  })
})

describe('sanitize — exception list internals', () => {
  it('escapes regex metacharacters in admin-provided exceptions', () => {
    // Kills escapeRegex mutation: replacement "\\$&" → "" (metachars stripped).
    // With exception 'J(oh)n', stripping metas yields /\bJohn\b/ which would
    // match 'John' in the input and protect it from TWO_CAP. Original escapes
    // metachars literally so 'John' stays a TWO_CAP target.
    expect(sanitize('Sam John Doe', { extraExceptions: ['J(oh)n'] }).clean).toBe('[name]')
  })

  it('sorts exceptions longest-first so substrings do not steal matches', () => {
    // Kills MethodExpression mutation (merged.sort(...) → merged) and
    // ArithmeticOperator (b.length - a.length → b.length + a.length).
    // Without longest-first, 'Foo' matches before 'Foo Bar', placeholder splits
    // the 2-cap run, and 'Bar Joe' gets redacted to [name].
    const input = 'Sam Foo Bar Joe'
    const opts = { extraExceptions: ['Foo', 'Foo Bar'] } as const
    expect(sanitize(input, opts).clean).toBe('Sam Foo Bar Joe')
  })

  it('anchors exception match at a word boundary', () => {
    // Not a mutation kill — just a sanity check that 'Claudes' (plural) isn't
    // protected by the 'Claude' exception and still gets redacted by TWO_CAP.
    expect(sanitize('Paul Claudes joined').clean).toBe('[name] joined')
  })

  it('applies the exception regex globally so every occurrence is protected', () => {
    // Kills StringLiteral mutation at line 139 col 59–62: `'g'` flag → `""`.
    // Without the global flag, only the FIRST 'Claude' is extracted as an
    // exception. The second 'Claude' then forms a TWO_CAP pair with 'Paul'
    // and becomes [name]. Two adjacent exception hits in the same input are
    // the only way to exercise the global-flag contract.
    expect(sanitize('Claude met Paul Claude').clean).toBe('Claude met Paul Claude')
  })

  it('default extraExceptions is an empty array, not a sentinel value', () => {
    // Kills ArrayDeclaration mutation line 202: `?? []` → `?? ["Stryker was here"]`.
    // With the sentinel, 'Stryker was here' would become an exception and split
    // the 'Foo Stryker ... Bar Baz' 2-cap candidates differently.
    expect(sanitize('Foo Stryker was here Bar Baz').clean).toBe('[name] was here [name]')
  })
})

describe('sanitize — placeholder uniqueness kill', () => {
  it('placeholders for 11+ URLs restore cleanly without prefix collision', () => {
    // Kills StringLiteral mutation at line 64: `PLACEHOLDER_SUFFIX = ' '` → `''`.
    // Without the suffix, token ` URL1` becomes a prefix substring of
    // ` URL10` (and 11..19). The restore loop's `split(token).join(...)`
    // corrupts the higher-indexed tokens in-place, leaving stray `0` / `1`
    // characters in the output. Eleven is the smallest count that triggers the
    // collision; we use twelve to cover the 1-vs-11 case too.
    const urls = Array.from({ length: 12 }, (_, i) => `https://blog${i}.example`)
    const input = urls.join(' ')
    // All non-allowlisted → every URL becomes '[link]'. With the mutation,
    // higher-indexed placeholders would survive with a stray digit or fail
    // to restore at all.
    const expected = urls.map(() => '[link]').join(' ')
    expect(sanitize(input).clean).toBe(expected)
  })
})

describe('sanitize — over-redaction threshold kill', () => {
  it('marks exactly 20% survival as over-redacted (<= boundary)', () => {
    // Kills EqualityOperator mutation line 179: `<= THRESHOLD` → `< THRESHOLD`.
    // 'Ab Cd e' — non-space chars: 'AbCde' (5). Clean: '[name] e' → strip tokens → 'e' (1).
    // 1/5 = 0.2 exactly. Original: 0.2 <= 0.2 → true. Mutation: 0.2 < 0.2 → false.
    expect(sanitize('Ab Cd e').overRedacted).toBe(true)
  })
})
