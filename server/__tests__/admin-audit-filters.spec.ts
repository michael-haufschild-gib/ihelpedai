// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for GET /api/admin/audit query filters.
 *
 * admin-id-bounds.spec covers oversize bounds; admin-pagination.spec covers
 * the page window. Neither asserts the filters actually narrow results.
 * The audit log is an ops-critical surface (every privileged action lands
 * here), so the filter behaviour must catch:
 *
 *   - admin_id   — only entries authored by that admin
 *   - action     — exact match (not LIKE or substring)
 *   - date_from  — inclusive lower bound
 *   - date_to    — inclusive upper bound (next-day exclusive in SQL)
 *   - empty-string filters (UI clearing) fall through to "no filter"
 *     instead of degenerating into "match nothing"
 *
 * The filter clear bug is the same shape as the admin-entries date_to
 * regression locked in admin-entries.spec — different code path, same
 * failure mode. Catching it here prevents a partial fix.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-audit-filters-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

let app: FastifyInstance
let cookie = ''
let primaryAdminId = ''
let secondaryAdminId = ''

interface AuditItem {
  id: string
  adminId: string | null
  action: string
  targetId: string | null
  createdAt: string
}

interface AuditPage {
  items: AuditItem[]
  total: number
}

async function listAudit(query: string): Promise<AuditPage> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/admin/audit${query === '' ? '' : `?${query}`}`,
    headers: { cookie },
  })
  expect(res.statusCode).toBe(200)
  return res.json() as AuditPage
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  const primary = await app.store.insertAdmin('audit-primary@admin.ai', hash, null)
  primaryAdminId = primary.id
  const secondary = await app.store.insertAdmin('audit-secondary@admin.ai', hash, null)
  secondaryAdminId = secondary.id

  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'audit-primary@admin.ai', password: 'testpassword12' },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(cookie).not.toBe('')

  // Plant deterministic audit rows. We can't easily backdate created_at
  // through the public API (insertAuditEntry uses the DB clock), so we
  // bypass with raw SQL via the underlying SQLite handle. This is a test
  // helper, not a behavioural shortcut.
  type StoreWithDb = { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }
  const db = (app.store as unknown as StoreWithDb).db
  const seed = (id: string, adminId: string, action: string, when: string): void => {
    db.prepare(
      'INSERT INTO audit_log (id, admin_id, action, target_id, target_kind, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, adminId, action, `target-${action}-${id}`, 'post', null, when)
  }

  seed('aud0000001', primaryAdminId, 'delete', '2026-01-15T00:00:00.000Z')
  seed('aud0000002', primaryAdminId, 'restore', '2026-02-15T00:00:00.000Z')
  seed('aud0000003', secondaryAdminId, 'delete', '2026-03-15T00:00:00.000Z')
  seed('aud0000004', secondaryAdminId, 'purge', '2026-04-15T00:00:00.000Z')
  seed('aud0000005', primaryAdminId, 'delete', '2026-04-23T00:00:00.000Z')
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('GET /api/admin/audit — admin_id filter', () => {
  it('narrows results to entries authored by the named admin', async () => {
    const all = await listAudit('')
    const primary = await listAudit(`admin_id=${primaryAdminId}`)
    expect(primary.total).toBeLessThan(all.total)
    expect(primary.total).toBeGreaterThan(0)
    expect(primary.items.every((i) => i.adminId === primaryAdminId)).toBe(true)
  })

  it('returns an empty page for a syntactically valid but non-existent admin id', async () => {
    const res = await listAudit('admin_id=aaaaaaaaaa')
    expect(res.total).toBe(0)
    expect(res.items).toHaveLength(0)
  })
})

describe('GET /api/admin/audit — action filter', () => {
  it('narrows to exact-match action only (not substring)', async () => {
    // We seeded actions: 'delete', 'restore', 'purge'. A LIKE-style filter
    // would let 'delete' bleed into 'restore'-by-substring searches; an
    // exact-match keeps the audit shape predictable.
    const deletes = await listAudit('action=delete')
    expect(deletes.items.every((i) => i.action === 'delete')).toBe(true)
    expect(deletes.items.length).toBeGreaterThan(0)

    const restores = await listAudit('action=restore')
    expect(restores.items.every((i) => i.action === 'restore')).toBe(true)
    expect(restores.items.length).toBeGreaterThan(0)

    // A bogus prefix must not match — 'del' is a substring of 'delete' but
    // the filter is exact, so the page is empty.
    const partial = await listAudit('action=del')
    expect(partial.total).toBe(0)
  })
})

describe('GET /api/admin/audit — date filters', () => {
  it('date_from clamps the page to entries on or after the given day', async () => {
    const fromMarch = await listAudit('date_from=2026-03-01')
    expect(fromMarch.items.every((i) => i.createdAt >= '2026-03-01')).toBe(true)
    expect(fromMarch.items.some((i) => i.id === 'aud0000003')).toBe(true)
    expect(fromMarch.items.some((i) => i.id === 'aud0000001')).toBe(false)
  })

  it('date_to clamps the page to entries on or before the given day, inclusive', async () => {
    const toFebInclusive = await listAudit('date_to=2026-02-15')
    // Inclusive upper bound: an event created at 2026-02-15T00:00:00.000Z
    // must be included, not dropped. The route translates to
    // `created_at < date(?, '+1 day')` — the 2/15 row's timestamp
    // < 2026-02-16, so it's IN. This is the regression a naïve
    // `<= dateTo` would silently break (timestamps later in the day
    // would be dropped).
    expect(toFebInclusive.items.some((i) => i.id === 'aud0000002')).toBe(true)
    expect(toFebInclusive.items.some((i) => i.id === 'aud0000003')).toBe(false)
  })

  it('combined date_from + date_to + admin_id narrows on every axis', async () => {
    // March-15 through April-15, secondary admin only, action=purge.
    const filtered = await listAudit(
      `admin_id=${secondaryAdminId}&action=purge&date_from=2026-03-01&date_to=2026-04-30`,
    )
    expect(filtered.total).toBe(1)
    expect(filtered.items[0]?.id).toBe('aud0000004')
  })

  it('rejects malformed dates with 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?date_from=2026-13-40',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('treats empty-string date filters as no filter (UI-clear semantics)', async () => {
    // Mirrors the admin-entries fix: a UI that submits date_to=&date_from=
    // when the user clears the picker must produce the unfiltered list,
    // not a NULL comparison that drops every row.
    const baseline = await listAudit('')
    const cleared = await listAudit('date_from=&date_to=')
    expect(cleared.total).toBe(baseline.total)
  })
})
