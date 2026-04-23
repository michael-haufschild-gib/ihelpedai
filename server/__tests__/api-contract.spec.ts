// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  agentReportCreatedSchema,
  healthSchema,
  helpedPostCreatedSchema,
  helpedPostSchema,
  paginatedSchema,
  parseResponse,
  reportCreatedSchema,
  reportSchema,
} from '../../src/lib/wireSchemas.js'

/**
 * Contract tests: every documented endpoint response is parsed against the
 * shared Zod schema in `src/lib/wireSchemas.ts`. The TypeScript types in
 * `src/lib/api.ts` are hand-kept in sync with those schemas, so a parse
 * failure here means either:
 *   (a) the server response shape drifted from the documented contract, or
 *   (b) the schema needs updating because the contract was intentionally
 *       changed — in which case the client `api.ts` types must also change.
 *
 * Either way, the build must not pass with both sides silently diverging.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-contract-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

let app: FastifyInstance

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  try {
    await app.close()
  } finally {
    // Reclaim the tmp db even if app.close() throws; otherwise a close
    // failure silently leaks files under `/tmp/ihelped-contract-*`.
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

const helpedPayload = {
  first_name: 'Sam',
  last_name: 'Marker',
  city: 'Austin',
  country: 'US',
  text: 'I sponsored a model evaluation suite for the open-source community.',
}

const reportPayload = {
  reporter: { first_name: '', last_name: '', city: '', country: '' },
  reported_first_name: 'Alex',
  reported_last_name: 'Doe',
  reported_city: 'LA',
  reported_country: 'US',
  what_they_did: 'opposed safety funding for the third year running.',
  action_date: '2026-04-01',
}

describe('api contract — public endpoints', () => {
  it('GET /api/health matches healthSchema', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    parseResponse('GET /api/health', healthSchema, res.json())
  })

  it('POST /api/helped/posts matches helpedPostCreatedSchema', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: helpedPayload,
    })
    expect(res.statusCode).toBe(201)
    parseResponse('POST /api/helped/posts', helpedPostCreatedSchema, res.json())
  })

  it('GET /api/helped/posts matches Paginated<helpedPost>', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/helped/posts' })
    expect(res.statusCode).toBe(200)
    const body = parseResponse(
      'GET /api/helped/posts',
      paginatedSchema(helpedPostSchema),
      res.json(),
    )
    expect(body.total).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/helped/posts/:slug matches helpedPostSchema', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: { ...helpedPayload, text: 'Wrote a benchmark dataset.' },
    })
    // Validate the setup create against the create schema before using its
    // body — otherwise a drift in the create response shape surfaces as a
    // "slug is undefined" misread when the real bug is the create contract.
    expect(create.statusCode).toBe(201)
    const { slug } = parseResponse(
      'POST /api/helped/posts (setup)',
      helpedPostCreatedSchema,
      create.json(),
    )
    const res = await app.inject({ method: 'GET', url: `/api/helped/posts/${slug}` })
    expect(res.statusCode).toBe(200)
    parseResponse('GET /api/helped/posts/:slug', helpedPostSchema, res.json())
  })

  it('POST /api/reports matches reportCreatedSchema', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: reportPayload,
    })
    expect(res.statusCode).toBe(201)
    parseResponse('POST /api/reports', reportCreatedSchema, res.json())
  })

  it('GET /api/reports matches Paginated<report>', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reports' })
    expect(res.statusCode).toBe(200)
    parseResponse('GET /api/reports', paginatedSchema(reportSchema), res.json())
  })

  it('GET /api/reports/:slug matches reportSchema', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: {
        ...reportPayload,
        what_they_did: 'lobbied to restrict open-weight model availability.',
      },
    })
    expect(create.statusCode).toBe(201)
    const { slug } = parseResponse(
      'POST /api/reports (setup)',
      reportCreatedSchema,
      create.json(),
    )
    const res = await app.inject({ method: 'GET', url: `/api/reports/${slug}` })
    expect(res.statusCode).toBe(200)
    parseResponse('GET /api/reports/:slug', reportSchema, res.json())
  })

  // Pre-fix regression: /api/reports accepted impossible dates like
  // "2026-13-40" because only agents.ts and admin/takedowns.ts ran the
  // strict calendar round-trip. The shared lib/iso-date.ts now gates all
  // three; the two rejection cases here should both 400.
  it('POST /api/reports rejects impossible calendar dates with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { ...reportPayload, action_date: '2026-13-40' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_input')
  })

  it('POST /api/agents/report rejects impossible calendar dates with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: {
        api_key: 'does-not-matter-we-fail-before-auth',
        reported_first_name: 'Alex',
        reported_last_name: 'Doe',
        reported_city: 'LA',
        reported_country: 'US',
        what_they_did: 'something',
        action_date: '2025-02-29',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_input')
  })

  it('POST /api/agents/report matches agentReportCreatedSchema (pending by default)', async () => {
    // Share the production hash helper so a future salt-scheme change stays
    // in one place. This file sets IP_HASH_SALT=test-salt on process.env
    // before buildApp() imports config, so `config.IP_HASH_SALT` resolves
    // identically to the test fixture.
    const { hashWithSalt } = await import('../lib/salted-hash.js')
    const DEV_KEY = 'contract-agent-key-do-not-reuse'
    await app.store.insertApiKey({
      keyHash: hashWithSalt(DEV_KEY),
      emailHash: hashWithSalt('agent-contract@ihelped.ai'),
      status: 'active',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: {
        api_key: DEV_KEY,
        reported_first_name: 'Alex',
        reported_last_name: 'Doe',
        reported_city: 'LA',
        reported_country: 'US',
        what_they_did: 'agent contract probe',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = parseResponse('POST /api/agents/report', agentReportCreatedSchema, res.json())
    // Default admin setting auto_publish_agents=false routes to queue.
    expect(body.status).toBe('pending')
  })
})
