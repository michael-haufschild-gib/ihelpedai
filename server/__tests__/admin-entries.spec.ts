// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/** Shared test context. */
interface TestCtx { app: FastifyInstance; cookie: string }

/** Boot the test app, seed an admin and one post. */
async function setupTestApp(): Promise<TestCtx> {
  process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-entries-')), 'test.db')
  const { buildApp } = await import('../index.js')
  const app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('admin@test.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'admin@test.ai', password: 'testpassword12' },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  expect(typeof raw === 'string' || Array.isArray(raw)).toBe(true)
  const cookie = typeof raw === 'string' ? raw : (raw as string[])[0]
  await app.store.insertPost({
    firstName: 'Alice',
    city: 'Berlin',
    country: 'DE',
    text: 'helped out',
    clientIpHash: null,
    source: 'form',
  })
  return { app, cookie }
}

/** Assert soft-delete and restore round-trip works. */
async function assertDeleteRestore({ app, cookie }: TestCtx) {
  const list = await app.inject({ method: 'GET', url: '/api/admin/entries', headers: { cookie } })
  const entryId = list.json().items[0].id

  const del = await app.inject({
    method: 'POST',
    url: `/api/admin/entries/${entryId}/action`,
    headers: { cookie },
    payload: { action: 'delete', reason: 'test' },
  })
  expect(del.statusCode).toBe(200)

  const detail = await app.inject({ method: 'GET', url: `/api/admin/entries/${entryId}`, headers: { cookie } })
  expect(detail.json().status).toBe('deleted')

  const publicGet = await app.inject({ method: 'GET', url: `/api/helped/posts/${entryId}` })
  expect(publicGet.statusCode).toBe(404)

  const restore = await app.inject({
    method: 'POST',
    url: `/api/admin/entries/${entryId}/action`,
    headers: { cookie },
    payload: { action: 'restore' },
  })
  expect(restore.statusCode).toBe(200)

  const after = await app.inject({ method: 'GET', url: `/api/admin/entries/${entryId}`, headers: { cookie } })
  expect(after.json().status).toBe('live')
}

describe('admin entries', () => {
  const ctx: TestCtx = {} as TestCtx

  beforeAll(async () => { Object.assign(ctx, await setupTestApp()) })
  afterAll(async () => { await ctx.app.close() })

  it('lists entries with auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/entries', headers: { cookie: ctx.cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items.length).toBeGreaterThanOrEqual(1)
    expect(body.items[0].entryType).toBe('post')
  })

  it('rejects list without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/entries' })
    expect(res.statusCode).toBe(401)
  })

  it('soft-deletes and restores an entry', async () => {
    await assertDeleteRestore(ctx)
  })

  it('records audit log entries for actions', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/api/admin/entries', headers: { cookie: ctx.cookie } })
    const entryId = list.json().items[0].id
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${entryId}/action`,
      headers: { cookie: ctx.cookie },
      payload: { action: 'delete', reason: 'audit-test' },
    })
    const detail = await ctx.app.inject({ method: 'GET', url: `/api/admin/entries/${entryId}`, headers: { cookie: ctx.cookie } })
    const auditLog = detail.json().audit_log
    expect(auditLog.length).toBeGreaterThanOrEqual(1)
    expect(auditLog.some((e: { action: string }) => e.action === 'delete')).toBe(true)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${entryId}/action`,
      headers: { cookie: ctx.cookie },
      payload: { action: 'restore' },
    })
  })
})
