// @vitest-environment node
import { createHash } from 'node:crypto'
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

let app: FastifyInstance

const hashWithSalt = (value: string): string =>
  createHash('sha256').update(`test-salt:${value}`).digest('hex')

async function seedDevKey(): Promise<void> {
  const { SqliteStore } = await import('../store/sqlite-store.js')
  const store = new SqliteStore(process.env.SQLITE_PATH ?? '')
  await store.insertApiKey({
    keyHash: hashWithSalt(DEV_API_KEY),
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

const agentPayload = (suffix: number) => ({
  api_key: DEV_API_KEY,
  reported_first_name: 'Jamie',
  reported_last_name: 'Placeholder',
  reported_city: 'Paris',
  reported_country: 'FR',
  what_they_did: `opposed safety funding — entry ${String(suffix)}.`,
})

describe('rate limit — POST /api/helped/posts (per-IP)', () => {
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

describe('rate limit — POST /api/agents/report (per-API-key)', () => {
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
