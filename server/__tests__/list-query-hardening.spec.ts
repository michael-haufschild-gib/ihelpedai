// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-listquery-'))
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

describe('list query hardening', () => {
  describe('page bound', () => {
    it('rejects page > 1000 on GET /api/helped/posts with 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/helped/posts?page=1001' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: 'invalid_input' })
    })

    it('accepts page = 1000 on GET /api/helped/posts', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/helped/posts?page=1000' })
      expect(res.statusCode).toBe(200)
    })

    it('rejects page > 1000 on GET /api/reports with 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports?page=9999' })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('q length bound', () => {
    it('rejects q longer than 200 chars on GET /api/helped/posts', async () => {
      const longQ = 'a'.repeat(201)
      const res = await app.inject({
        method: 'GET',
        url: `/api/helped/posts?q=${longQ}`,
      })
      expect(res.statusCode).toBe(400)
    })

    it('accepts q exactly 200 chars', async () => {
      const q = 'a'.repeat(200)
      const res = await app.inject({
        method: 'GET',
        url: `/api/helped/posts?q=${q}`,
      })
      expect(res.statusCode).toBe(200)
    })
  })

  describe('LIKE wildcard escaping', () => {
    // LIKE's `_` matches any single char and `%` matches any run. Before
    // escaping, a search for `foo_bar` would false-positive on `fooXbar`.
    // After escaping + ESCAPE '\', the underscore is taken literally.
    it('treats underscore in q as literal, not LIKE wildcard', async () => {
      const literal = await app.inject({
        method: 'POST',
        url: '/api/helped/posts',
        payload: {
          first_name: 'Lee',
          last_name: 'Last',
          city: 'Paris',
          country: 'FR',
          text: 'payload with foo_bar literal token',
        },
      })
      expect(literal.statusCode).toBe(201)

      const decoy = await app.inject({
        method: 'POST',
        url: '/api/helped/posts',
        payload: {
          first_name: 'Kim',
          last_name: 'Last',
          city: 'Paris',
          country: 'FR',
          text: 'payload with fooXbar decoy token',
        },
      })
      expect(decoy.statusCode).toBe(201)

      const res = await app.inject({ method: 'GET', url: '/api/helped/posts?q=foo_bar' })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { items: { text: string }[]; total: number }
      expect(body.total).toBe(1)
      expect(body.items[0]!.text).toContain('foo_bar')
      expect(body.items.some((i) => i.text.includes('fooXbar'))).toBe(false)
    })

    it('treats percent in q as literal, not LIKE wildcard', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/helped/posts',
        payload: {
          first_name: 'Jo',
          last_name: 'Last',
          city: 'Oslo',
          country: 'NO',
          text: 'discount code 50%off for members',
        },
      })

      // Pre-fix, `50%off` would match literally; also `%o` alone would have
      // matched everything. Post-fix, `%` matches only literal `%`.
      const lone = await app.inject({ method: 'GET', url: '/api/helped/posts?q=%25' })
      expect(lone.statusCode).toBe(200)
      const loneBody = lone.json() as { items: { text: string }[]; total: number }
      // Only rows containing a literal `%` should match — the seed row is the
      // only one we inserted with a percent sign in its text field.
      expect(loneBody.total).toBe(1)
      expect(loneBody.items[0]!.text).toContain('50%off')
    })
  })
})
