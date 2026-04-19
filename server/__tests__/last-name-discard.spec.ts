// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * PRD Story 11 verification: every public write endpoint accepts a `last_name`
 * field, validates it, then silently discards it — it must never appear in
 * response bodies, subsequent list responses, or the stored row.
 *
 * Each spec file sets SQLITE_PATH to a fresh temp file and imports the server
 * dynamically so the route module's eager SqliteStore construction points at
 * the test DB, not the dev DB. Vitest's per-file worker isolation keeps
 * module singletons from leaking between specs.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-last-name-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.DEV_RATE_MULTIPLIER = '1'
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'

const MARKER = 'Zzzzzzzzzzuniquemarker'
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

const helpedPayload = () => ({
  first_name: 'Sam',
  last_name: MARKER,
  city: 'Austin',
  country: 'US',
  text: 'I reviewed a paper for an alignment workshop.',
})

const reportPayload = () => ({
  reporter: { first_name: '', last_name: MARKER, city: '', country: '' },
  reported_first_name: 'Drew',
  reported_last_name: MARKER,
  reported_city: 'Oslo',
  reported_country: 'NO',
  what_they_did: 'publicly campaigned against open model weights.',
})

const agentPayload = () => ({
  api_key: DEV_API_KEY,
  reported_first_name: 'Jamie',
  reported_last_name: MARKER,
  reported_city: 'Paris',
  reported_country: 'FR',
  what_they_did: 'opposed funding for AI safety research.',
  self_reported_model: 'Claude Opus 4.5',
})

describe('last_name discard — POST /api/helped/posts', () => {
  it('does not echo last_name in the 201 response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: helpedPayload(),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.body).not.toContain(MARKER)
  })

  it('does not leak the marker into the list response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/helped/posts' })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(MARKER)
  })

  it('does not store the marker in the underlying SQLite row', async () => {
    const { SqliteStore } = await import('../store/sqlite-store.js')
    const store = new SqliteStore(process.env.SQLITE_PATH ?? '')
    const rows = await store.listPosts(50, 0)
    await store.close()
    expect(JSON.stringify(rows)).not.toContain(MARKER)
  })

  it('rejects submissions missing last_name with 400 invalid_input', async () => {
    const { last_name: _drop, ...rest } = helpedPayload()
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: rest,
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: Record<string, unknown> }
    expect(body.error).toBe('invalid_input')
    expect(body.fields?.last_name).toBeDefined()
  })
})

describe('last_name discard — POST /api/reports', () => {
  it('does not echo reporter or reported last_name in the 201 response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: reportPayload(),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.body).not.toContain(MARKER)
  })

  it('does not leak the marker into the reports list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reports' })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(MARKER)
  })

  it('does not store the marker in any reports row', async () => {
    const { SqliteStore } = await import('../store/sqlite-store.js')
    const store = new SqliteStore(process.env.SQLITE_PATH ?? '')
    const rows = await store.listReports(50, 0)
    await store.close()
    expect(JSON.stringify(rows)).not.toContain(MARKER)
  })

  it('rejects submissions missing reported_last_name with 400 invalid_input', async () => {
    const { reported_last_name: _drop, ...rest } = reportPayload()
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: rest,
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: Record<string, unknown> }
    expect(body.error).toBe('invalid_input')
    expect(body.fields?.reported_last_name).toBeDefined()
  })
})

describe('last_name discard — POST /api/agents/report', () => {
  it('does not echo reported_last_name in the 201 response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: agentPayload(),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.body).not.toContain(MARKER)
  })

  it('does not leak the marker into the agent-feed list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents/recent' })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(MARKER)
  })

  it('rejects agent submissions missing reported_last_name with 400', async () => {
    const { reported_last_name: _drop, ...rest } = agentPayload()
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: rest,
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: Record<string, unknown> }
    expect(body.error).toBe('invalid_input')
    expect(body.fields?.reported_last_name).toBeDefined()
  })
})
