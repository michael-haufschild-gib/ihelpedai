// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
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
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
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
    const { slug } = create.json() as { slug: string }
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
    const { slug } = create.json() as { slug: string }
    const res = await app.inject({ method: 'GET', url: `/api/reports/${slug}` })
    expect(res.statusCode).toBe(200)
    parseResponse('GET /api/reports/:slug', reportSchema, res.json())
  })
})
