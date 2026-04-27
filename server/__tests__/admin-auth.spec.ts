// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('admin auth', () => {
  let app: FastifyInstance
  let adminId = ''

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-admin-')), 'test.db')
    const { buildApp } = await import('../index.js')
    app = await buildApp()

    const hash = await bcrypt.hash('testpassword12', 10)
    const admin = await app.store.insertAdmin('test@admin.ai', hash, null)
    adminId = admin.id
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
    const cookie =
      typeof login.headers['set-cookie'] === 'string'
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

  it('cleans up expired sessions and unusable reset tokens without touching live rows', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const expiredSessionId = await app.store.insertSession(adminId, past)
    const liveSessionId = await app.store.insertSession(adminId, future)
    const expiredResetHash = createHash('sha256').update('expired-reset').digest('hex')
    const usedResetHash = createHash('sha256').update('used-reset').digest('hex')
    const liveResetHash = createHash('sha256').update('live-reset').digest('hex')
    await app.store.insertPasswordReset(adminId, expiredResetHash, past)
    const usedResetId = await app.store.insertPasswordReset(adminId, usedResetHash, future)
    await app.store.markPasswordResetUsed(usedResetId)
    await app.store.insertPasswordReset(adminId, liveResetHash, future)

    await app.store.cleanupExpiredAuthState()
    await app.store.touchSession(expiredSessionId, future)

    expect(await app.store.getSession(expiredSessionId)).toBe(null)
    expect(await app.store.getSession(liveSessionId)).not.toBe(null)
    expect(await app.store.getPasswordResetByHash(expiredResetHash)).toBe(null)
    expect(await app.store.getPasswordResetByHash(usedResetHash)).toBe(null)
    expect(await app.store.getPasswordResetByHash(liveResetHash)).not.toBe(null)
  })

  it('rejects oversized reset tokens before token lookup', async () => {
    const store = app.store as unknown as {
      getPasswordResetByHash: (...args: unknown[]) => Promise<unknown>
    }
    const original = store.getPasswordResetByHash
    store.getPasswordResetByHash = async () => {
      throw new Error('getPasswordResetByHash should not be called for oversized tokens')
    }
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/reset-password',
        payload: {
          token: 'x'.repeat(256),
          password: 'Correct-Horse-77-Battery!',
          confirm_password: 'Correct-Horse-77-Battery!',
        },
      })
      expect(res.statusCode).toBe(400)
      const body = res.json() as { error: string; fields?: { token?: unknown } }
      expect(body.error).toBe('invalid_input')
      expect(typeof body.fields?.token).toBe('string')
    } finally {
      store.getPasswordResetByHash = original
    }
  })

  it('rejects oversized current password before bcrypt comparison', async () => {
    const sessionId = await app.store.insertSession(adminId, new Date(Date.now() + 3_600_000).toISOString())
    const cookie = `admin_session=${app.signCookie(sessionId)}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie },
      payload: {
        current_password: 'x'.repeat(256),
        new_password: 'Correct-Horse-77-Battery!',
      },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { current_password?: unknown } }
    expect(body.error).toBe('invalid_input')
    expect(typeof body.fields?.current_password).toBe('string')
  })
})
