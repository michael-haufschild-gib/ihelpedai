// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('error envelope', () => {
  it('unknown route returns 404 { error: "not_found" } instead of Fastify default', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' })
    expect(res.statusCode).toBe(404)
    const body = res.json() as Record<string, unknown>
    // Fastify default emits {statusCode, error: "Not Found", message: ...}.
    // Our override must replace it with the PRD envelope shape.
    expect(body).toEqual({ error: 'not_found' })
    expect(body).not.toHaveProperty('statusCode')
  })

  it('unknown POST route returns 404 { error: "not_found" }', async () => {
    const res = await app.inject({ method: 'POST', url: '/also-not-a-route', payload: {} })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'not_found' })
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
    expect(body.fields).toBeTypeOf('object')
  })
})
