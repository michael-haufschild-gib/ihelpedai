// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isAcceptablePassword } from './password-strength.js'

/**
 * Covers both legs of the gate: the hard blocklist and the zxcvbn entropy
 * score. The hard-blocklist tests pin the dev seed credential — if that ever
 * starts being accepted, the seed default could be reused in production.
 */
describe('isAcceptablePassword', () => {
  describe('hard blocklist', () => {
    it('rejects the dev seed password regardless of case', () => {
      expect(isAcceptablePassword('devpassword12')).toBe(false)
      expect(isAcceptablePassword('DevPassword12')).toBe(false)
      expect(isAcceptablePassword('DEVPASSWORD12')).toBe(false)
    })

    it('rejects obvious site-name + common-suffix patterns', () => {
      expect(isAcceptablePassword('ihelpedai')).toBe(false)
      expect(isAcceptablePassword('ihelpedaiadmin')).toBe(false)
      expect(isAcceptablePassword('ihelpedai123')).toBe(false)
    })
  })

  describe('zxcvbn entropy gate', () => {
    it('rejects classic weak patterns', () => {
      expect(isAcceptablePassword('password1234')).toBe(false)
      expect(isAcceptablePassword('qwertyuiopas')).toBe(false)
      expect(isAcceptablePassword('admin1234567')).toBe(false)
      expect(isAcceptablePassword('letmein123456')).toBe(false)
    })

    it('accepts a high-entropy passphrase', () => {
      // Mixed-case, uncommon multi-word phrase + numbers + punctuation.
      expect(isAcceptablePassword('Tug-of-Squid! 87 lobotomy boats')).toBe(true)
    })

    it('accepts a long random-looking string', () => {
      expect(isAcceptablePassword('xq7!pL9zrW#mF4tBh2vN')).toBe(true)
    })
  })
})
