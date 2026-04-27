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
    // `recent_reports` is now a paginated envelope `{ items, page, page_size, total }`
    // rather than a bare array, so admins on a high-volume key can navigate
    // past the first page. The isolation contract still holds: each detail
    // page only sees its own key's submissions.
    const recentA = (detailA.json() as { recent_reports: { items: Array<{ id: string }>; total: number } })
      .recent_reports
    expect(recentA.items.some((r) => r.id === reportA.id)).toBe(true)
    expect(recentA.items.some((r) => r.id === reportB.id)).toBe(false)
    expect(recentA.total).toBe(1)

    const detailB = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${b.id}`,
      headers: { cookie },
    })
    const recentB = (detailB.json() as { recent_reports: { items: Array<{ id: string }>; total: number } })
      .recent_reports
    expect(recentB.items.some((r) => r.id === reportB.id)).toBe(true)
    expect(recentB.items.some((r) => r.id === reportA.id)).toBe(false)
    expect(recentB.total).toBe(1)
  })

  it('paginates recent_reports past the first 20 rows so admins see the long tail', async () => {
    // Seed a key with > 1 page of history so the contract is observable.
    const k = await app.store.insertApiKey({
      keyHash: 'pagination-target-keyhash',
      keyLast4: 'page',
      emailHash: 'pagination-email-hash',
      status: 'active',
    })
    // 25 submissions guarantees a partial second page (5 rows).
    for (let i = 0; i < 25; i += 1) {
      await app.store.insertAgentReport(
        {
          reporterFirstName: null,
          reporterCity: null,
          reporterCountry: null,
          reportedFirstName: `Pagination${String(i)}`,
          reportedCity: 'Berlin',
          reportedCountry: 'DE',
          text: `pagination probe ${String(i)}`,
          actionDate: null,
          severity: null,
          selfReportedModel: null,
          clientIpHash: null,
          source: 'api',
        },
        'pagination-target-keyhash',
        'live',
      )
    }
    const page1 = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${k.id}?reports_page=1`,
      headers: { cookie },
    })
    expect(page1.statusCode).toBe(200)
    const body1 = page1.json() as {
      recent_reports: { items: Array<{ id: string }>; page: number; page_size: number; total: number }
    }
    expect(body1.recent_reports.total).toBe(25)
    expect(body1.recent_reports.page).toBe(1)
    expect(body1.recent_reports.items.length).toBe(20)

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${k.id}?reports_page=2`,
      headers: { cookie },
    })
    expect(page2.statusCode).toBe(200)
    const body2 = page2.json() as {
      recent_reports: { items: Array<{ id: string }>; page: number; total: number }
    }
    expect(body2.recent_reports.page).toBe(2)
    expect(body2.recent_reports.items.length).toBe(5)
    // Pages must not overlap — each id appears on exactly one page.
    const idsP1 = new Set(body1.recent_reports.items.map((r) => r.id))
    const idsP2 = new Set(body2.recent_reports.items.map((r) => r.id))
    for (const id of idsP2) expect(idsP1.has(id)).toBe(false)
  })
})
