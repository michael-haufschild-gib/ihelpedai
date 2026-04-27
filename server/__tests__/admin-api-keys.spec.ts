// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('admin API key routes', () => {
  let app: FastifyInstance
  let cookie: string
  let tmpRoot: string

  beforeAll(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ihelped-admin-api-keys-'))
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
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('omits keyHash from list and detail responses', async () => {
    const key = await app.store.insertApiKey({
      keyHash: 'hash-for-admin-route-0000',
      keyLast4: 'real',
      emailHash: 'email-hash-for-admin-route',
      status: 'active',
    })

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/api-keys',
      headers: { cookie },
    })
    expect(list.statusCode).toBe(200)
    const listBody = list.json() as { items: Array<Record<string, unknown>> }
    const listItem = listBody.items.find((item) => item.id === key.id)
    if (listItem === undefined) throw new Error('expected inserted key in list')
    expect(Object.keys(listItem).sort()).toEqual([
      'emailHash',
      'id',
      'issuedAt',
      'keyLast4',
      'lastUsedAt',
      'status',
      'usageCount',
    ])
    expect(listItem.keyLast4).toBe('real')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${key.id}`,
      headers: { cookie },
    })
    expect(detail.statusCode).toBe(200)
    expect(Object.keys(detail.json() as Record<string, unknown>).sort()).toEqual([
      'emailHash',
      'id',
      'issuedAt',
      'keyLast4',
      'lastUsedAt',
      'recent_reports',
      'status',
      'usageCount',
    ])
  })

  it('rejects revoke without the literal "REVOKE" confirmation (400 + helpful message)', async () => {
    const key = await app.store.insertApiKey({
      keyHash: 'wrong-confirm-keyhash',
      keyLast4: 'wrng',
      emailHash: 'wrong-confirm-emailhash',
      status: 'active',
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/api-keys/${key.id}/revoke`,
      headers: { cookie },
      payload: { confirmation: 'revoke', reason: 'lowercase typo' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; message: string }
    expect(body.error).toBe('invalid_input')
    expect(body.message).toContain('REVOKE')
    // The key must remain active — wrong confirmation must NEVER apply.
    expect((await app.store.getApiKey(key.id))?.status).toBe('active')
  })

  it('detail recent_reports shows ONLY reports submitted by this key', async () => {
    // Critical isolation: an admin viewing key A should not see key B's
    // submission history. The store's listReportsForApiKey filters by
    // exact keyHash match. A regression that broadened the SQL to e.g.
    // `LIKE %keyhash%` would leak cross-key history.
    const a = await app.store.insertApiKey({
      keyHash: 'keya-history-hash',
      keyLast4: 'aaaa',
      emailHash: 'keya-email',
      status: 'active',
    })
    const b = await app.store.insertApiKey({
      keyHash: 'keyb-history-hash',
      keyLast4: 'bbbb',
      emailHash: 'keyb-email',
      status: 'active',
    })

    const reportA = await app.store.insertAgentReport(
      {
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: 'A',
        reportedCity: 'Paris',
        reportedCountry: 'FR',
        text: 'submitted via key A',
        actionDate: null,
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'api',
      },
      'keya-history-hash',
      'live',
    )
    const reportB = await app.store.insertAgentReport(
      {
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: 'B',
        reportedCity: 'Paris',
        reportedCountry: 'FR',
        text: 'submitted via key B',
        actionDate: null,
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'api',
      },
      'keyb-history-hash',
      'live',
    )

    const detailA = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${a.id}`,
      headers: { cookie },
    })
    expect(detailA.statusCode).toBe(200)
    const recentA = (detailA.json() as { recent_reports: Array<{ id: string }> }).recent_reports
    expect(recentA.some((r) => r.id === reportA.id)).toBe(true)
    expect(recentA.some((r) => r.id === reportB.id)).toBe(false)

    const detailB = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${b.id}`,
      headers: { cookie },
    })
    const recentB = (detailB.json() as { recent_reports: Array<{ id: string }> }).recent_reports
    expect(recentB.some((r) => r.id === reportB.id)).toBe(true)
    expect(recentB.some((r) => r.id === reportA.id)).toBe(false)
  })
})
