import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
import { dictionary as commonDictionary, adjacencyGraphs } from '@zxcvbn-ts/language-common'
import { dictionary as enDictionary, translations as enTranslations } from '@zxcvbn-ts/language-en'

/**
 * Password-strength gate for admin password creation. Combines two checks:
 *
 *  1. **zxcvbn entropy score** — score 0-4 against the standard English +
 *     common-keyboard dictionaries. Anything below 3 (a "moderately strong"
 *     password) is rejected. This catches the long tail of variations on
 *     "password1234" / "qwertyuiop" that a literal blocklist would miss.
 *
 *  2. **Hard project-specific blocklist** — explicitly bans the dev seed
 *     password and a handful of obvious site-name combinations. Belt-and-
 *     suspenders so that even if zxcvbn ever scores one of these higher than
 *     expected (it should not), the dev default cannot be reused as a real
 *     credential.
 *
 * The check is intentionally case-insensitive: an attacker iterating common
 * passwords does not care about case and neither should our defence.
 */

const MIN_SCORE = 3

/**
 * Project-specific values we never want to accept as a real admin password,
 * regardless of how zxcvbn scores them. Keep this list small — entropy is the
 * primary defence; this list exists to lock down dev defaults and obvious
 * site-name patterns that zxcvbn does not know about.
 */
const HARD_BLOCKLIST: ReadonlySet<string> = new Set([
  'devpassword12',
  'ihelpedai',
  'ihelpedaiadmin',
  'ihelpedai123',
  'ihelpedai1234',
])

let zxcvbnConfigured = false

/** Lazily configure zxcvbn-ts dictionaries once per process. */
function ensureZxcvbnConfigured(): void {
  if (zxcvbnConfigured) return
  zxcvbnOptions.setOptions({
    translations: enTranslations,
    graphs: adjacencyGraphs,
    dictionary: { ...commonDictionary, ...enDictionary },
  })
  zxcvbnConfigured = true
}

/**
 * Returns true when `password` is acceptable for an admin account. False when
 * the password is too weak (entropy gate) or in the hard blocklist.
 */
export function isAcceptablePassword(password: string): boolean {
  const lowered = password.toLowerCase()
  if (HARD_BLOCKLIST.has(lowered)) return false
  ensureZxcvbnConfigured()
  const result = zxcvbn(password)
  return result.score >= MIN_SCORE
}
