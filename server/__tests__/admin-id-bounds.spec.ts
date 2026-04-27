// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Admin IDs are generated as 10-char nanoids. Route validation permits a
 * modest 64-char window for compatibility, but must reject absurd IDs before
 * the request reaches store lookups.
 */
describe('admin ID bounds', () => {
  let app: FastifyInstance
  let cookie: string
  let tmpRoot: string
  let previousSqlitePath: string | undefined

  beforeAll(async () => {
    previousSqlitePath = process.env.SQLITE_PATH
    tmpRoot = mkdtempSync(join(tmpdir(), 'ihelped-admin-id-bounds-'))
    process.env.SQLITE_PATH = join(tmpRoot, 'test.db')
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
    cookie = typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : ''
    expect(cookie).not.toBe('')
  })

  afterAll(async () => {
    try {
      await app.close()
    } finally {
      if (previousSqlitePath === undefined) delete process.env.SQLITE_PATH
      else process.env.SQLITE_PATH = previousSqlitePath
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  const longId = 'x'.repeat(65)

  it.each([
    {
      method: 'GET',
      url: `/api/admin/api-keys/${longId}`,
      storeMethod: 'getApiKey',
    },
    {
      method: 'POST',
      url: `/api/admin/api-keys/${longId}/revoke`,
      payload: { confirmation: 'REVOKE' },
      storeMethod: 'getApiKey',
    },
    {
      method: 'POST',
      url: `/api/admin/queue/${longId}/action`,
      payload: { action: 'approve' },
      storeMethod: 'getAdminEntryDetail',
    },
    {
      method: 'GET',
      url: `/api/admin/takedowns/${longId}`,
      storeMethod: 'getTakedown',
    },
    {
      method: 'PATCH',
      url: `/api/admin/takedowns/${longId}`,
      payload: { status: 'closed' },
      storeMethod: 'getTakedown',
    },
    {
      method: 'POST',
      url: `/api/admin/admins/${longId}/deactivate`,
      payload: { reason: 'too long' },
      storeMethod: 'getAdmin',
    },
  ] as const)('rejects oversized ID before $storeMethod for $method $url', async (route) => {
    type StoreMethod = typeof route.storeMethod
    const store = app.store as unknown as Record<StoreMethod, (...args: unknown[]) => Promise<unknown>>
    const original = store[route.storeMethod]
    store[route.storeMethod] = async (...args: unknown[]) => {
      if (args[0] === longId) {
        throw new Error(`${route.storeMethod} should not be called for oversized IDs`)
      }
      return original.apply(app.store, args)
    }
    try {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: { cookie },
        payload: 'payload' in route ? route.payload : undefined,
      })
      expect(res.statusCode).toBe(404)
      expect((res.json() as { error: string }).error).toBe('not_found')
    } finally {
      store[route.storeMethod] = original
    }
  })

  it('rejects oversized queue bulk IDs before store lookup', async () => {
    const store = app.store as unknown as {
      getAdminEntryDetail: (...args: unknown[]) => Promise<unknown>
    }
    const original = store.getAdminEntryDetail
    store.getAdminEntryDetail = async () => {
      throw new Error('getAdminEntryDetail should not be called for oversized IDs')
    }
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/queue/bulk',
        headers: { cookie },
        payload: { ids: [longId], action: 'approve' },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as { error: string }).error).toBe('invalid_input')
    } finally {
      store.getAdminEntryDetail = original
    }
  })

  it.each(['/api/admin/audit?admin_id=' + longId, '/api/admin/audit?action=' + 'x'.repeat(101)])(
    'rejects oversized audit query filters before store lookup for %s',
    async (url) => {
      const store = app.store as unknown as {
        listAuditLog: (...args: unknown[]) => Promise<unknown>
      }
      const original = store.listAuditLog
      store.listAuditLog = async () => {
        throw new Error('listAuditLog should not be called for oversized filters')
      }
      try {
        const res = await app.inject({
          method: 'GET',
          url,
          headers: { cookie },
        })
        expect(res.statusCode).toBe(400)
        expect((res.json() as { error: string }).error).toBe('invalid_input')
      } finally {
        store.listAuditLog = original
      }
    },
  )

  it('rejects oversized admin entry search before store lookup', async () => {
    const store = app.store as unknown as {
      listAdminEntries: (...args: unknown[]) => Promise<unknown>
    }
    const original = store.listAdminEntries
    store.listAdminEntries = async () => {
      throw new Error('listAdminEntries should not be called for oversized q')
    }
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/entries?q=${encodeURIComponent('x'.repeat(201))}`,
        headers: { cookie },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as { error: string }).error).toBe('invalid_input')
    } finally {
      store.listAdminEntries = original
    }
  })
})
