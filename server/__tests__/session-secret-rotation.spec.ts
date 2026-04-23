// @vitest-environment node
import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { parseAdminSessionSecrets } from '../config.js'

/**
 * Locks the rotation primitive: a comma-separated `ADMIN_SESSION_SECRET` env
 * yields an ordered list whose first element will sign new session cookies
 * and whose remaining elements are accepted by `@fastify/cookie` for
 * verification only. Whitespace and empties are stripped so a sloppy
 * deploy edit (`KEY1, KEY2 ,, KEY3`) still parses.
 */
describe('parseAdminSessionSecrets', () => {
  it('returns a single-element array for a single secret', () => {
    expect(parseAdminSessionSecrets('only-secret')).toEqual(['only-secret'])
  })

  it('preserves order — first element is the active signing key', () => {
    expect(parseAdminSessionSecrets('newest,older,oldest')).toEqual([
      'newest',
      'older',
      'oldest',
    ])
  })

  it('trims whitespace around each entry', () => {
    expect(parseAdminSessionSecrets('  fresh ,   older  ')).toEqual(['fresh', 'older'])
  })

  it('drops empty entries from sloppy comma usage', () => {
    expect(parseAdminSessionSecrets('a,,b,, ,c')).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array for an empty string', () => {
    expect(parseAdminSessionSecrets('')).toEqual([])
    expect(parseAdminSessionSecrets('   ')).toEqual([])
    expect(parseAdminSessionSecrets(',,,')).toEqual([])
  })
})

/**
 * Locks the full rotation contract end-to-end: a cookie signed by a secret
 * that has since been demoted to "verify-only" (position >= 1) still
 * unsigns cleanly. The parser test above can pass even if `@fastify/cookie`
 * regresses on multi-secret verification; this test exercises the real
 * registration path that production uses.
 */
describe('admin session cookie rotation (@fastify/cookie)', () => {
  it('accepts a cookie signed with the previous secret after a rotation', async () => {
    const OLD = 'previous-admin-session-secret'
    const NEW = 'newly-rotated-admin-session-secret'

    // Phase 1: app is deployed with a single secret; a session cookie gets
    // signed against it and handed to the admin's browser.
    const before = Fastify()
    await before.register(cookie, { secret: OLD })
    await before.ready()
    const signed = before.signCookie('session-id-xyz')
    await before.close()

    // Phase 2: the deploy rotates — new secret at position 0, previous at 1.
    const after = Fastify()
    await after.register(cookie, { secret: [NEW, OLD] })
    await after.ready()
    const unsigned = after.unsignCookie(signed)
    expect(unsigned.valid).toBe(true)
    expect(unsigned.value).toBe('session-id-xyz')
    await after.close()
  })

  it('rejects a cookie once the secret that signed it is dropped', async () => {
    const OLD = 'old-secret-being-retired'
    const NEW = 'new-secret-after-full-rotation'

    const before = Fastify()
    await before.register(cookie, { secret: OLD })
    await before.ready()
    const signed = before.signCookie('session-id-abc')
    await before.close()

    // Only the NEW secret remains — previous sessions must no longer verify.
    const after = Fastify()
    await after.register(cookie, { secret: [NEW] })
    await after.ready()
    const unsigned = after.unsignCookie(signed)
    expect(unsigned.valid).toBe(false)
    await after.close()
  })
})
