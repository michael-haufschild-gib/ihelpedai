// @vitest-environment node
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
