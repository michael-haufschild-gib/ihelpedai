// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * PRD Story 10 verification. Two axes:
 *   - Per-IP form submissions: 10/hour → 11th is 429.
 *   - Per-API-key agent calls: 60/hour → 61st is 429.
 *
 * DEV_RATE_MULTIPLIER=1 disables the dev 10x boost so the raw PRD limits
 * apply. Each .spec.ts gets a fresh module registry and fresh limiter
 * singletons thanks to Vitest per-file worker isolation.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-rate-limit-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.DEV_RATE_MULTIPLIER = '1'
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'

const DEV_API_KEY = 'dev-key-do-not-use-in-prod'
const OVER_REDACTED_TEXT = 'John Smith Mary Jones'

let app: FastifyInstance

// Share the production hash helper. IP_HASH_SALT is set on process.env above
// so `config.IP_HASH_SALT` (read at salted-hash import time) resolves to the
// same 'test-salt' value the fixture expects.
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

const helpedPayload = (suffix: number) => ({
  first_name: 'Sam',
  last_name: 'Placeholder',
  city: 'Austin',
  country: 'US',
  text: `I contributed to an alignment workshop — run ${String(suffix)}.`,
})

const reportPayload = (suffix: number) => ({
  reporter: { first_name: '', last_name: '', city: '', country: '' },
  reported_first_name: 'Drew',
  reported_last_name: 'Placeholder',
  reported_city: 'Oslo',
  reported_country: 'NO',
  what_they_did: `opposed safety funding — entry ${String(suffix)}.`,
})

const agentPayload = (suffix: number) => ({
  api_key: DEV_API_KEY,
  reported_first_name: 'Jamie',
  reported_last_name: 'Placeholder',
  reported_city: 'Paris',
  reported_country: 'FR',
  what_they_did: `opposed safety funding — entry ${String(suffix)}.`,
})

describe('rate limit — POST /api/helped/posts (per-IP)', () => {
  it('does not consume quota for over-redacted submissions', async () => {
    const headers = {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.46',
    }
    for (let i = 0; i < 10; i += 1) {
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/helped/posts',
        payload: { ...helpedPayload(300 + i), text: OVER_REDACTED_TEXT },
        headers,
      })
      expect(invalid.statusCode).toBe(400)
    }

    const valid = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: helpedPayload(400),
      headers,
    })
    expect(valid.statusCode).toBe(201)
  })

  it('does not consume quota for invalid submissions', async () => {
    const headers = {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.45',
    }
    for (let i = 0; i < 10; i += 1) {
      const { last_name: _drop, ...invalidPayload } = helpedPayload(100 + i)
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/helped/posts',
        payload: invalidPayload,
        headers,
      })
      expect(invalid.statusCode).toBe(400)
    }

    const valid = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: helpedPayload(200),
      headers,
    })
    expect(valid.statusCode).toBe(201)
  })

  it('accepts 10 submissions then rejects the 11th with 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/helped/posts',
        payload: helpedPayload(i),
        headers: { 'content-type': 'application/json' },
      })
      expect(ok.statusCode).toBe(201)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: helpedPayload(11),
      headers: { 'content-type': 'application/json' },
    })
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json() as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
  })
})

describe('rate limit — POST /api/reports (per-IP)', () => {
  it('does not consume quota for over-redacted submissions', async () => {
    const headers = {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.47',
    }
    for (let i = 0; i < 10; i += 1) {
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/reports',
        payload: { ...reportPayload(300 + i), what_they_did: OVER_REDACTED_TEXT },
        headers,
      })
      expect(invalid.statusCode).toBe(400)
    }

    const valid = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: reportPayload(400),
      headers,
    })
    expect(valid.statusCode).toBe(201)
  })
})

describe('rate limit — POST /api/agents/report (per-API-key)', () => {
  it('does not consume key quota while submissions are frozen', async () => {
    const { hashWithSalt } = await import('../lib/salted-hash.js')
    const frozenKey = 'frozen-agent-key-do-not-reuse'
    await app.store.insertApiKey({
      keyHash: hashWithSalt(frozenKey),
      keyLast4: frozenKey.slice(-4),
      emailHash: hashWithSalt('frozen-agent@ihelped.ai'),
      status: 'active',
    })
    await app.store.setSetting('submission_freeze', 'true')
    try {
      for (let i = 0; i < 60; i += 1) {
        const frozen = await app.inject({
          method: 'POST',
          url: '/api/agents/report',
          payload: { ...agentPayload(100 + i), api_key: frozenKey },
          headers: { 'content-type': 'application/json' },
        })
        expect(frozen.statusCode).toBe(503)
      }
    } finally {
      await app.store.setSetting('submission_freeze', 'false')
    }

    const valid = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: { ...agentPayload(200), api_key: frozenKey },
      headers: { 'content-type': 'application/json' },
    })
    expect(valid.statusCode).toBe(201)
  })

  it('does not consume key quota for over-redacted submissions', async () => {
    const { hashWithSalt } = await import('../lib/salted-hash.js')
    const overRedactedKey = 'over-redacted-agent-key-do-not-reuse'
    await app.store.insertApiKey({
      keyHash: hashWithSalt(overRedactedKey),
      keyLast4: overRedactedKey.slice(-4),
      emailHash: hashWithSalt('over-redacted-agent@ihelped.ai'),
      status: 'active',
    })

    for (let i = 0; i < 60; i += 1) {
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/agents/report',
        payload: {
          ...agentPayload(300 + i),
          api_key: overRedactedKey,
          what_they_did: OVER_REDACTED_TEXT,
        },
        headers: { 'content-type': 'application/json' },
      })
      expect(invalid.statusCode).toBe(400)
    }

    const valid = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: { ...agentPayload(400), api_key: overRedactedKey },
      headers: { 'content-type': 'application/json' },
    })
    expect(valid.statusCode).toBe(201)
  })

  it('accepts 60 submissions then rejects the 61st with 429', async () => {
    for (let i = 0; i < 60; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/agents/report',
        payload: agentPayload(i),
        headers: { 'content-type': 'application/json' },
      })
      expect(ok.statusCode).toBe(201)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: agentPayload(61),
      headers: { 'content-type': 'application/json' },
    })
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json() as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
  })
})
