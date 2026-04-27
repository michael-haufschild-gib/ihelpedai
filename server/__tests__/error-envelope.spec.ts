// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiErrorEnvelopeSchema } from '../../src/lib/wireSchemas.js'

/*
 * Contract test: every error response the server emits must conform to the
 * public envelope shape — `{ error: <kind>, ... }` where `error` is one of
 * the documented enum values. Fastify's default 404 handler and default
 * error handler previously leaked framework-specific strings (e.g. "Not
 * Found", "Unsupported Media Type") into the `error` field; the custom
 * handlers in server/index.ts normalize them.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-error-envelope-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '10'

let app: FastifyInstance
let adminCookie: string

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('ops@admin.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'ops@admin.ai', password: 'testpassword12' },
  })
  const raw = login.headers['set-cookie']
  adminCookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(adminCookie).not.toBe('')
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('error envelope', () => {
  it('shared schema accepts only documented error kinds', () => {
    expect(apiErrorEnvelopeSchema.safeParse({ error: 'mail_delivery_failed' }).success).toBe(true)
    expect(apiErrorEnvelopeSchema.safeParse({ error: 'not_found' }).success).toBe(true)
    expect(apiErrorEnvelopeSchema.safeParse({ error: 'Not Found' }).success).toBe(false)
    expect(apiErrorEnvelopeSchema.safeParse({ error: 'mystery' }).success).toBe(false)
  })

  it('unknown route returns 404 { error: "not_found" } instead of Fastify default', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' })
    expect(res.statusCode).toBe(404)
    const body = res.json() as Record<string, unknown>
    // Fastify default emits {statusCode, error: "Not Found", message: ...}.
    // Our override must replace it with the PRD envelope shape.
    expect(body).toEqual({ error: 'not_found' })
    expect(apiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(body).not.toHaveProperty('statusCode')
  })

  it('unknown POST route returns 404 { error: "not_found" }', async () => {
    const res = await app.inject({ method: 'POST', url: '/also-not-a-route', payload: {} })
    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(body).toEqual({ error: 'not_found' })
    expect(apiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
  })

  it('malformed JSON body returns { error: "invalid_input" } with a message', async () => {
    // Fastify throws a FastifyError with statusCode 400 and a message like
    // "Body is not a valid JSON". The default handler used to leak that
    // message into the `error` field; now it goes into a separate `message`
    // field so the `error` enum stays stable.
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      headers: { 'content-type': 'application/json' },
      payload: '{ not valid json',
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as Record<string, unknown>
    expect(body.error).toBe('invalid_input')
    expect(apiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    // Message may include the reason; it's allowed but not required.
    if ('message' in body) expect(typeof body.message).toBe('string')
  })

  it('zod validation errors still use invalid_input with per-field errors', async () => {
    // Unchanged from prior behaviour — locks that the standardization did
    // not regress the Zod path.
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: { first_name: '', last_name: 'X', city: 'NYC', country: 'US', text: 't' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: Record<string, string> }
    expect(body.error).toBe('invalid_input')
    expect(apiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(body.fields).toBeTypeOf('object')
  })

  it('manual safeParse errors return string field messages matching shared schema', async () => {
    const reset = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: {
        token: 'x'.repeat(256),
        password: 'Correct-Horse-77-Battery!',
        confirm_password: 'Correct-Horse-77-Battery!',
      },
    })
    expect(reset.statusCode).toBe(400)
    const resetBody = reset.json() as { fields?: { token?: unknown } }
    expect(apiErrorEnvelopeSchema.safeParse(resetBody).success).toBe(true)
    expect(typeof resetBody.fields?.token).toBe('string')

    const takedown = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie: adminCookie },
      payload: {
        reason: 'Invalid date contract.',
        date_received: '2026-02-30',
      },
    })
    expect(takedown.statusCode).toBe(400)
    const takedownBody = takedown.json() as { fields?: { date_received?: unknown } }
    expect(apiErrorEnvelopeSchema.safeParse(takedownBody).success).toBe(true)
    expect(typeof takedownBody.fields?.date_received).toBe('string')
  })

  it('unsupported content-type on a JSON-only POST falls into the invalid_input envelope', async () => {
    // Fastify rejects requests with a body but no content-type registered for
    // it (in our case, only application/json is parsed). The framework's
    // default error message would leak "Unsupported Media Type" into the
    // `error` field; the custom error handler in server/index.ts maps it to
    // the documented enum kind. Locks that mapping for status 415-class
    // rejections — without this assertion, a regression that re-enabled the
    // raw Fastify error envelope would only surface in a forensic 415 chase.
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      headers: { 'content-type': 'text/plain' },
      payload: 'this is not json',
    })
    // Status should be in the 4xx range; exact code depends on Fastify
    // version (415 or 400). The lock is on the envelope shape: `error`
    // must be the documented enum, never the raw framework string.
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
    const body = res.json() as Record<string, unknown>
    expect(apiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(body.error).toBe('invalid_input')
    // The framework string ("Unsupported Media Type") must NOT have
    // leaked into `error`.
    expect(body.error).not.toBe('Unsupported Media Type')
  })

  it('GET on a POST-only route returns 4xx with a documented envelope', async () => {
    // Fastify treats wrong-method as a 404 by default (route not found for
    // METHOD url). Our custom 404 handler responds with `{ error: "not_found" }`,
    // which is a documented enum kind. Locks that the wrong-method path
    // doesn't surface a method-mismatch hint that could fingerprint the
    // route table.
    const res = await app.inject({ method: 'GET', url: '/api/admin/login' })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
    const body = res.json() as Record<string, unknown>
    expect(apiErrorEnvelopeSchema.safeParse(body).success).toBe(true)
  })
})
