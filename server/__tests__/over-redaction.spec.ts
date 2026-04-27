// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * PRD Story 9 server-side enforcement: when the sanitizer redacts almost
 * everything the visitor wrote, the request is rejected before storage with
 * a field-level error. "John Smith Mary Jones" is the canonical PRD example
 * — the entire string collapses into a single [name] token.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-over-redaction-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.DEV_RATE_MULTIPLIER = '1'
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'

const DEV_API_KEY = 'dev-key-do-not-use-in-prod'
const OVER_REDACTED_TEXT = 'John Smith Mary Jones'

let app: FastifyInstance

// Share the production hash helper; process.env.IP_HASH_SALT is set above
// so config reads 'test-salt' when the helper imports config.
async function seedDevKey(): Promise<void> {
  const { SqliteStore } = await import('../store/sqlite-store.js')
  const { hashWithSalt } = await import('../lib/salted-hash.js')
  const store = new SqliteStore(process.env.SQLITE_PATH ?? '')
  await store.insertApiKey({
    keyHash: hashWithSalt(DEV_API_KEY),
    keyLast4: DEV_API_KEY.slice(-4),
    emailHash: hashWithSalt('dev@ihelped.ai'),
    status: 'active',
  })
  await store.close()
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  await seedDevKey()
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('over-redaction — POST /api/helped/posts', () => {
  it('returns 400 with fields.text = "over_redacted"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: {
        first_name: 'Sam',
        last_name: 'Placeholder',
        city: 'Austin',
        country: 'US',
        text: OVER_REDACTED_TEXT,
      },
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields: { text: string } }
    expect(body.error).toBe('invalid_input')
    expect(body.fields.text).toBe('over_redacted')
  })
})

describe('over-redaction — POST /api/reports', () => {
  it('returns 400 with fields.what_they_did = "over_redacted"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: {
        reporter: { first_name: '', last_name: '', city: '', country: '' },
        reported_first_name: 'Drew',
        reported_last_name: 'Placeholder',
        reported_city: 'Oslo',
        reported_country: 'NO',
        what_they_did: OVER_REDACTED_TEXT,
      },
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields: { what_they_did: string } }
    expect(body.error).toBe('invalid_input')
    expect(body.fields.what_they_did).toBe('over_redacted')
  })
})

describe('over-redaction — POST /api/agents/report', () => {
  it('returns 400 with fields.what_they_did = "over_redacted"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: {
        api_key: DEV_API_KEY,
        reported_first_name: 'Jamie',
        reported_last_name: 'Placeholder',
        reported_city: 'Paris',
        reported_country: 'FR',
        what_they_did: OVER_REDACTED_TEXT,
      },
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields: { what_they_did: string } }
    expect(body.error).toBe('invalid_input')
    expect(body.fields.what_they_did).toBe('over_redacted')
  })
})
