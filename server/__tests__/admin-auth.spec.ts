// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('admin auth', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-admin-')), 'test.db')
    const { buildApp } = await import('../index.js')
    app = await buildApp()

    const hash = await bcrypt.hash('testpassword12', 10)
    await app.store.insertAdmin('test@admin.ai', hash, null)
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects login with wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'test@admin.ai', password: 'wrongpassword1' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Email or password is incorrect.')
  })

  it('rejects login with unknown email (same message)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'nobody@admin.ai', password: 'testpassword12' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Email or password is incorrect.')
  })

  it('succeeds with correct credentials and sets session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'test@admin.ai', password: 'testpassword12' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ok')
    expect(res.json().admin.email).toBe('test@admin.ai')
    const cookieHeader = res.headers['set-cookie']
    const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader
    expect(typeof cookieValue).toBe('string')
    expect(cookieValue).toMatch(/admin_session=/)
  })

  it('GET /api/admin/me returns 401 without session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/me' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/admin/me returns admin info with valid session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'test@admin.ai', password: 'testpassword12' },
    })
    const cookie = login.headers['set-cookie']

    const me = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: typeof cookie === 'string' ? cookie : (cookie as string[])[0] },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().email).toBe('test@admin.ai')
  })

  it('logout clears session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'test@admin.ai', password: 'testpassword12' },
    })
    const cookie = typeof login.headers['set-cookie'] === 'string'
      ? login.headers['set-cookie']
      : (login.headers['set-cookie'] as string[])[0]

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { cookie },
    })
    expect(logoutRes.statusCode).toBe(200)

    const meAfter = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie },
    })
    expect(meAfter.statusCode).toBe(401)
  })
})
