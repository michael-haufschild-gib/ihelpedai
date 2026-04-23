// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration guard for the admin `sanitizer_exceptions` setting: entries
 * saved by an admin flow through into the server sanitizer so that a
 * subsequent post preserves the phrase that the base rule would redact.
 * Also acts as a regression test for the orphan-feature bug where the
 * setting was writable but never read.
 */
describe('sanitizer_exceptions admin setting → server sanitizer', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ihelped-sanitizer-exc-')),
      'test.db',
    )
    const { buildApp } = await import('../index.js')
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('preserves an admin-added phrase that would otherwise redact to [name]', async () => {
    // Seed the setting directly via the store (bypasses the admin auth
    // requirement — the feature we're testing is consumption, not write).
    await app.store.setSetting('sanitizer_exceptions', 'Ada Lovelace')

    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: {
        first_name: 'Sam',
        last_name: 'Marker',
        city: 'Cambridge',
        country: 'GB',
        text: 'Today I re-read Ada Lovelace notes on the analytical engine.',
      },
    })
    expect(res.statusCode).toBe(201)
    const slug = res.json().slug as string

    const detail = await app.inject({ method: 'GET', url: `/api/helped/posts/${slug}` })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().text).toContain('Ada Lovelace')
  })

  it('still redacts two-word names that are NOT in the admin list', async () => {
    await app.store.setSetting('sanitizer_exceptions', 'Ada Lovelace')

    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: {
        first_name: 'Sam',
        last_name: 'Marker',
        city: 'Oslo',
        country: 'NO',
        text: 'Ada Lovelace is great but so is John Doe in the archives.',
      },
    })
    expect(res.statusCode).toBe(201)
    const slug = res.json().slug as string

    const detail = await app.inject({ method: 'GET', url: `/api/helped/posts/${slug}` })
    const stored = detail.json().text as string
    expect(stored).toContain('Ada Lovelace')
    expect(stored).toContain('[name]')
    expect(stored).not.toContain('John Doe')
  })
})
