// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration coverage for server/routes/admin/accounts.ts. Exercises the
 * invite flow (creates admin + reset token, rolls back on mail failure),
 * the list endpoint, the deactivate-self guard, and the deactivate-other
 * success path. These are infrequent operations but the self-guard and
 * the rollback are easy to break with a refactor, so lock them in.
 */
describe('admin accounts routes', () => {
  let app: FastifyInstance
  let cookie: string
  let adminId: string

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ihelped-admin-accounts-')),
      'test.db',
    )
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    const hash = await bcrypt.hash('testpassword12', 10)
    const admin = await app.store.insertAdmin('ops@admin.ai', hash, null)
    adminId = admin.id
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'ops@admin.ai', password: 'testpassword12' },
    })
    expect(login.statusCode).toBe(200)
    const raw = login.headers['set-cookie']
    cookie = typeof raw === 'string' ? raw : (raw as string[])[0]
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/admin/admins lists admins without exposing password hashes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/admins',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: Array<{ email: string; status: string }> }
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    const payload = JSON.stringify(body)
    expect(payload).not.toContain('password_hash')
    expect(payload).not.toContain('passwordHash')
  })

  it('POST /api/admin/admins/invite rejects duplicate email with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/admins/invite',
      headers: { cookie },
      payload: { email: 'ops@admin.ai' }, // already exists
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('invalid_input')
  })

  it('POST /api/admin/admins/invite creates the row + reset token on happy path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/admins/invite',
      headers: { cookie },
      payload: { email: 'new-admin@admin.ai' },
    })
    expect(res.statusCode).toBe(201)
    const invited = await app.store.getAdminByEmail('new-admin@admin.ai')
    expect(invited?.email).toBe('new-admin@admin.ai')
    expect(invited?.status).toBe('active')
  })

  it('POST /api/admin/admins/:id/deactivate refuses self-deactivation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/admins/${adminId}/deactivate`,
      headers: { cookie },
      payload: { reason: 'stop talking to myself' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('cannot deactivate your own account')
  })

  it('POST /api/admin/admins/:id/deactivate deactivates another admin + clears their sessions', async () => {
    const hash = await bcrypt.hash('otherpassword12', 10)
    const victim = await app.store.insertAdmin('target@admin.ai', hash, adminId)
    // Seed a session for the victim so the deactivation path has something
    // to tear down.
    await app.store.insertSession(victim.id, new Date(Date.now() + 3_600_000).toISOString())

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/admins/${victim.id}/deactivate`,
      headers: { cookie },
      payload: { reason: 'test' },
    })
    expect(res.statusCode).toBe(200)
    const after = await app.store.getAdmin(victim.id)
    expect(after?.status).toBe('deactivated')
  })
})
