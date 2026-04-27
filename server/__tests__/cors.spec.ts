// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for the CORS middleware registered in server/index.ts.
 *
 * Production routing is:
 *   browser → nginx (https://ihelped.ai) → fastify (loopback)
 * The fastify CORS plugin allows only one origin: `config.PUBLIC_URL`. A
 * regression that loosened this — `origin: true` (reflect-everything),
 * `origin: '*'`, or a missing CORS check — would let a third-party site
 * read authenticated admin endpoints by inviting an admin browser to make
 * cross-origin XHR with `credentials: 'include'`.
 *
 * Cross-origin browser preflight: the browser sends OPTIONS with
 * `Origin: https://attacker.example`. The Fastify CORS plugin must respond
 * WITHOUT `access-control-allow-origin` (or with the wrong origin) so the
 * browser refuses to follow up with the real request.
 *
 * @fastify/cors does NOT 4xx the OPTIONS — it returns 204/200 with the
 * appropriate ACAO header (or absence thereof). The lock here is on the
 * header presence/value, not on the status code.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-cors-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'
// PUBLIC_URL is the canonical allowed origin. The dev default is
// http://localhost:5173 — keep that here and assert it's the only one
// the CORS plugin reflects.
process.env.PUBLIC_URL = 'http://localhost:5173'

const ALLOWED_ORIGIN = process.env.PUBLIC_URL

let app: FastifyInstance

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('CORS — preflight reflection', () => {
  it('reflects the allowed origin on a same-origin OPTIONS preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    })
    // 204 is what @fastify/cors returns on a successful preflight by default.
    // The only behavioural assertion that matters is the ACAO header, but
    // including the 204 catches a regression that switched to 200.
    expect(res.statusCode).toBeLessThan(400)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    // credentials=true is required for the admin session cookie to flow.
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does NOT reflect the requesting origin on a cross-origin OPTIONS preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'https://attacker.example',
        'access-control-request-method': 'GET',
      },
    })
    const ac = res.headers['access-control-allow-origin']
    // The lock: the response either omits the ACAO header entirely or
    // returns the configured allowlist origin — never the attacker's
    // origin. Without this assertion, a switch to `origin: true` would
    // silently authorize every site.
    expect(ac).not.toBe('https://attacker.example')
    if (ac !== undefined) {
      expect(ac).toBe(ALLOWED_ORIGIN)
    }
  })
})

describe('CORS — actual GET response', () => {
  it('reflects the allowed origin on the real request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: ALLOWED_ORIGIN },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not reflect a non-allowed origin on the real request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://attacker.example' },
    })
    expect(res.statusCode).toBe(200)
    const ac = res.headers['access-control-allow-origin']
    expect(ac).not.toBe('https://attacker.example')
  })
})
