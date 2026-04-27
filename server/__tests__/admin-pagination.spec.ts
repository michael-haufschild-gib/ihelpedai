// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Admin list endpoints all perform offset pagination against backing stores.
 * Keep their accepted page window bounded so authenticated typo/fuzz traffic
 * cannot request arbitrarily large offsets while public list routes reject
 * the same input.
 */
describe('admin pagination bounds', () => {
  let app: FastifyInstance
  let cookie: string

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-admin-pagination-')), 'test.db')
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

  const listRoutes = [
    '/api/admin/entries',
    '/api/admin/queue',
    '/api/admin/api-keys',
    '/api/admin/takedowns',
    '/api/admin/audit',
  ]

  it.each(listRoutes)('rejects page values past the admin pagination window for %s', async (url) => {
    const res = await app.inject({
      method: 'GET',
      url: `${url}?page=1001`,
      headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it.each(listRoutes)('accepts the maximum supported admin page for %s', async (url) => {
    const res = await app.inject({
      method: 'GET',
      url: `${url}?page=1000`,
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { page: number }).page).toBe(1000)
  })
})
