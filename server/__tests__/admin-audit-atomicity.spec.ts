// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

interface TestCtx {
  app: FastifyInstance
  cookie: string
}

interface StoreWithSqliteDb {
  db: { exec: (sql: string) => void }
}

const sqlitePath = join(mkdtempSync(join(tmpdir(), 'ihelped-admin-audit-atomicity-')), 'test.db')

async function setupTestApp(): Promise<TestCtx> {
  for (const path of [sqlitePath, `${sqlitePath}-wal`, `${sqlitePath}-shm`]) {
    rmSync(path, { force: true })
  }
  process.env.SQLITE_PATH = sqlitePath
  const { buildApp } = await import('../index.js')
  const app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('ops@admin.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'ops@admin.ai', password: 'testpassword12' },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  const cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(cookie).not.toBe('')
  return { app, cookie }
}

function breakAuditWrites(app: FastifyInstance): void {
  ;(app.store as unknown as StoreWithSqliteDb).db.exec('DROP TABLE audit_log')
}

describe('admin audited mutations are atomic', () => {
  let ctx: TestCtx | null = null

  afterEach(async () => {
    await ctx?.app.close()
    ctx = null
  })

  it('rolls back entry status changes when audit insert fails', async () => {
    ctx = await setupTestApp()
    const post = await ctx.app.store.insertPost({
      firstName: 'Atomic',
      city: 'Oslo',
      country: 'NO',
      text: 'status should remain live',
      clientIpHash: null,
      source: 'form',
    })
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/action`,
      headers: { cookie: ctx.cookie },
      payload: { action: 'delete', reason: 'audit failure' },
    })

    expect(res.statusCode).toBe(500)
    const detail = await ctx.app.store.getAdminEntryDetail(post.id)
    expect(detail?.status).toBe('live')
  })

  it('rolls back purge when audit insert fails', async () => {
    ctx = await setupTestApp()
    const post = await ctx.app.store.insertPost({
      firstName: 'Atomic',
      city: 'Oslo',
      country: 'NO',
      text: 'purge should roll back',
      clientIpHash: null,
      source: 'form',
    })
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/purge`,
      headers: { cookie: ctx.cookie },
      payload: { confirmation: `${post.id} PURGE`, reason: 'audit failure' },
    })

    expect(res.statusCode).toBe(500)
    const detail = await ctx.app.store.getAdminEntryDetail(post.id)
    expect(detail?.status).toBe('live')
  })

  it('rolls back API key revocation when audit insert fails', async () => {
    ctx = await setupTestApp()
    const key = await ctx.app.store.insertApiKey({
      keyHash: 'h'.repeat(64),
      keyLast4: 'hhhh',
      emailHash: 'e'.repeat(64),
      status: 'active',
    })
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/api-keys/${key.id}/revoke`,
      headers: { cookie: ctx.cookie },
      payload: { confirmation: 'REVOKE', reason: 'audit failure' },
    })

    expect(res.statusCode).toBe(500)
    expect((await ctx.app.store.getApiKey(key.id))?.status).toBe('active')
  })

  it('rolls back settings updates when audit insert fails', async () => {
    ctx = await setupTestApp()
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie: ctx.cookie },
      payload: { key: 'submission_freeze', value: 'true' },
    })

    expect(res.statusCode).toBe(500)
    expect(await ctx.app.store.getSetting('submission_freeze')).toBe(null)
  })

  it('rolls back takedown creation when audit insert fails', async () => {
    ctx = await setupTestApp()
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie: ctx.cookie },
      payload: { reason: 'audit failure', date_received: '2026-04-26' },
    })

    expect(res.statusCode).toBe(500)
    expect(await ctx.app.store.countTakedowns()).toBe(0)
  })

  it('rolls back takedown updates when audit insert fails', async () => {
    ctx = await setupTestApp()
    const takedown = await ctx.app.store.insertTakedown({
      requesterEmail: null,
      entryId: null,
      entryKind: null,
      reason: 'created before audit outage',
      dateReceived: '2026-04-26',
    })
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/takedowns/${takedown.id}`,
      headers: { cookie: ctx.cookie },
      payload: { status: 'closed', disposition: 'entry_deleted', notes: 'audit failure' },
    })

    expect(res.statusCode).toBe(500)
    const after = await ctx.app.store.getTakedown(takedown.id)
    expect(after?.status).toBe('open')
    expect(after?.disposition).toBe(null)
    expect(after?.notes).toBe('')
  })

  it('rolls back admin deactivation when audit insert fails', async () => {
    ctx = await setupTestApp()
    const hash = await bcrypt.hash('testpassword12', 10)
    const target = await ctx.app.store.insertAdmin('target@admin.ai', hash, null)
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/admins/${target.id}/deactivate`,
      headers: { cookie: ctx.cookie },
      payload: { reason: 'audit failure' },
    })

    expect(res.statusCode).toBe(500)
    expect((await ctx.app.store.getAdmin(target.id))?.status).toBe('active')
  })

  it('rolls back admin invites when audit insert fails', async () => {
    ctx = await setupTestApp()
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/admins/invite',
      headers: { cookie: ctx.cookie },
      payload: { email: 'new-admin@admin.ai' },
    })

    expect(res.statusCode).toBe(500)
    expect((await ctx.app.store.getAdminByEmail('new-admin@admin.ai'))?.email ?? null).toBe(null)
  })

  it('rolls back password changes when audit insert fails', async () => {
    ctx = await setupTestApp()
    breakAuditWrites(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie: ctx.cookie },
      payload: {
        current_password: 'testpassword12',
        new_password: 'Correct-Horse-77-Battery!',
      },
    })

    expect(res.statusCode).toBe(500)
    const admin = await ctx.app.store.getAdminByEmail('ops@admin.ai')
    if (admin === null) throw new Error('expected seeded admin')
    expect(await bcrypt.compare('testpassword12', admin.passwordHash)).toBe(true)
    expect(await bcrypt.compare('Correct-Horse-77-Battery!', admin.passwordHash)).toBe(false)
  })
})
