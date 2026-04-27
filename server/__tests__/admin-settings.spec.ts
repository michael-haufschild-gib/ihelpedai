// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration coverage for server/routes/admin/settings.ts. Covers:
 *  - requireAdmin gate (401 without cookie)
 *  - GET returns defaults merged with stored overrides
 *  - PUT rejects an unknown key via the Zod enum
 *  - PUT round-trip + audit-log entry
 *  - sanitizer_exceptions audit detail never echoes exception text
 *  - PUT rejects payloads past the 10000-char limit
 */
describe('admin settings routes', () => {
  let app: FastifyInstance
  let cookie: string

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-admin-settings-')), 'test.db')
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    const hash = await bcrypt.hash('testpassword12', 10)
    await app.store.insertAdmin('ops@admin.ai', hash, null)
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'ops@admin.ai', password: 'testpassword12' },
    })
    expect(login.statusCode).toBe(200)
    const raw = login.headers['set-cookie']
    cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
    expect(cookie).not.toBe('')
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET without cookie returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/settings' })
    expect(res.statusCode).toBe(401)
  })

  it('GET returns the three known defaults when nothing is stored', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, string>
    expect(body.auto_publish_agents).toBe('false')
    expect(body.submission_freeze).toBe('false')
    expect(body.sanitizer_exceptions).toBe('')
  })

  it('GET ignores unknown setting rows instead of echoing them into the contract', async () => {
    await app.store.setSetting('legacy_unknown_setting', 'secret')
    const res = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, string>
    expect(body.auto_publish_agents).toBe('false')
    expect(body.submission_freeze).toBe('false')
    expect(body.sanitizer_exceptions).toBe('')
    expect(body).not.toHaveProperty('legacy_unknown_setting')
  })

  it('PUT rejects an unknown key with 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { key: 'secret_admin_password', value: 'hunter2' },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('PUT rejects non-boolean values for boolean settings', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { key: 'auto_publish_agents', value: 'sometimes' },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('PUT writes a setting, GET reads it back, audit log captures the change', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { key: 'auto_publish_agents', value: 'true' },
    })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie } })
    expect((get.json() as Record<string, string>).auto_publish_agents).toBe('true')

    const audits = await app.store.listAuditLogForTarget('auto_publish_agents')
    const update = audits.find((a) => a.action === 'update_setting')
    // Value is truncated to the first 100 chars in the audit detail. Value
    // here is "true" so the truncation isn't exercised, but the prefix
    // "Set to: " must be present — that contract is locked by this assertion.
    expect(update?.details).toBe('Set to: true')
  })

  it('PUT rejects values longer than 10000 chars', async () => {
    const huge = 'x'.repeat(10001)
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { key: 'sanitizer_exceptions', value: huge },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PUT records only exception count in audit details for sanitizer_exceptions', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { key: 'sanitizer_exceptions', value: 'Ada Lovelace\nAda Lovelace\n' },
    })
    expect(res.statusCode).toBe(200)
    const audits = await app.store.listAuditLogForTarget('sanitizer_exceptions')
    const latest = audits[0]
    if (latest === undefined) throw new Error('expected audit entry')
    expect(latest.details).toBe('Updated sanitizer exception list (1 entry)')
    expect(latest.details).not.toContain('Ada Lovelace')
  })
})
