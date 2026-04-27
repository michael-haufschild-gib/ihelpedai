// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for GET /api/admin/entries query filters.
 *
 * Existing specs cover oversize bounds (admin-id-bounds), pagination window
 * (admin-pagination), wildcard escaping (admin-entries.spec). What's NOT
 * covered there is whether each filter axis actually narrows the result set
 * to the rows it claims:
 *
 *   - status:    'live' | 'pending' | 'deleted'
 *   - entry_type 'post' | 'report'
 *   - source:    'form' | 'api'
 *   - sort:      'asc' | 'desc' (default desc)
 *   - date_from: inclusive lower bound on created_at
 *   - date_to:   inclusive upper bound, mapped to next-day-exclusive in SQL
 *
 * If a filter ever silently narrows to zero rows (or, worse, returns
 * everything ignoring the filter) the admin UI displays the wrong set
 * with no error signal. The schema contract tests would still pass.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-entry-filters-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

interface AdminEntry {
  id: string
  entryType: 'post' | 'report'
  status: 'live' | 'pending' | 'deleted'
  source: 'form' | 'api'
  createdAt: string
}

interface AdminEntryPage {
  items: AdminEntry[]
  total: number
}

let app: FastifyInstance
let cookie = ''

const seeded: Record<string, string> = {}

async function listEntries(query: string): Promise<AdminEntryPage> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/admin/entries${query === '' ? '' : `?${query}`}`,
    headers: { cookie },
  })
  expect(res.statusCode).toBe(200)
  return res.json() as AdminEntryPage
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('entry-ops@admin.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'entry-ops@admin.ai', password: 'testpassword12' },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(cookie).not.toBe('')

  // Seed a known mix of entries to exercise every filter axis.
  // We backdate created_at via raw SQL because the public store API uses
  // the DB clock — that's normally what you want, but here we need
  // deterministic created_at values to test date_from/date_to.
  type StoreWithDb = { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }
  const db = (app.store as unknown as StoreWithDb).db

  const formLive = await app.store.insertPost({
    firstName: 'FormLive',
    city: 'Austin',
    country: 'US',
    text: 'form live entry',
    clientIpHash: null,
    source: 'form',
  })
  seeded.formLive = formLive.id
  db.prepare("UPDATE posts SET created_at = '2026-01-15T00:00:00.000Z' WHERE id = ?").run(formLive.id)

  // Form entries can be marked 'deleted' via an admin action; mimic that
  // by direct status update on a freshly inserted form post.
  const formDeleted = await app.store.insertPost({
    firstName: 'FormDeleted',
    city: 'Berlin',
    country: 'DE',
    text: 'form deleted entry',
    clientIpHash: null,
    source: 'form',
  })
  await app.store.updateEntryStatus(formDeleted.id, 'post', 'deleted')
  seeded.formDeleted = formDeleted.id
  db.prepare("UPDATE posts SET created_at = '2026-02-15T00:00:00.000Z' WHERE id = ?").run(formDeleted.id)

  // Insert an api-source pending report (the agent moderation queue case).
  await app.store.insertApiKey({
    keyHash: 'entry-filters-keyhash',
    keyLast4: 'last',
    emailHash: 'entry-filters-emailhash',
    status: 'active',
  })
  const apiPending = await app.store.insertAgentReport(
    {
      reporterFirstName: null,
      reporterCity: null,
      reporterCountry: null,
      reportedFirstName: 'ApiPending',
      reportedCity: 'Paris',
      reportedCountry: 'FR',
      text: 'pending agent report',
      actionDate: null,
      severity: null,
      selfReportedModel: null,
      clientIpHash: null,
      source: 'api',
    },
    'entry-filters-keyhash',
    'pending',
  )
  seeded.apiPending = apiPending.id
  db.prepare("UPDATE reports SET created_at = '2026-03-15T00:00:00.000Z' WHERE id = ?").run(apiPending.id)

  // Insert a form-source live report.
  const formReportLive = await app.store.insertReport({
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: 'FormReport',
    reportedCity: 'Oslo',
    reportedCountry: 'NO',
    text: 'form report live',
    actionDate: null,
    severity: null,
    selfReportedModel: null,
    clientIpHash: null,
    source: 'form',
  })
  seeded.formReportLive = formReportLive.id
  db.prepare("UPDATE reports SET created_at = '2026-04-15T00:00:00.000Z' WHERE id = ?").run(formReportLive.id)
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('GET /api/admin/entries — status filter', () => {
  it('status=deleted returns soft-deleted rows only', async () => {
    const res = await listEntries('status=deleted')
    expect(res.items.every((i) => i.status === 'deleted')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formDeleted)).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formLive)).toBe(false)
  })

  it('status=pending returns the agent-queued rows', async () => {
    const res = await listEntries('status=pending')
    expect(res.items.every((i) => i.status === 'pending')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.apiPending)).toBe(true)
  })

  it('status=live returns the live rows; not deleted, not pending', async () => {
    const res = await listEntries('status=live')
    expect(res.items.every((i) => i.status === 'live')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formLive)).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formReportLive)).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formDeleted)).toBe(false)
  })

  it('rejects an unknown status enum with 400 invalid_input', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/entries?status=mystery',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/admin/entries — entry_type + source filters', () => {
  it('entry_type=post excludes report rows', async () => {
    const res = await listEntries('entry_type=post')
    expect(res.items.every((i) => i.entryType === 'post')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formReportLive)).toBe(false)
    expect(res.items.some((i) => i.id === seeded.apiPending)).toBe(false)
  })

  it('entry_type=report excludes post rows', async () => {
    const res = await listEntries('entry_type=report')
    expect(res.items.every((i) => i.entryType === 'report')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formLive)).toBe(false)
    expect(res.items.some((i) => i.id === seeded.formDeleted)).toBe(false)
  })

  it('source=api narrows to api-source entries (the moderation queue surface)', async () => {
    const res = await listEntries('source=api')
    expect(res.items.every((i) => i.source === 'api')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.apiPending)).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formLive)).toBe(false)
  })

  it('source=form excludes api submissions', async () => {
    const res = await listEntries('source=form')
    expect(res.items.every((i) => i.source === 'form')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.apiPending)).toBe(false)
  })
})

describe('GET /api/admin/entries — date_from / date_to filters', () => {
  it('date_from clamps to entries on or after the given calendar day', async () => {
    const res = await listEntries('date_from=2026-03-01')
    expect(res.items.every((i) => i.createdAt >= '2026-03-01')).toBe(true)
    expect(res.items.some((i) => i.id === seeded.formLive)).toBe(false)
    expect(res.items.some((i) => i.id === seeded.formDeleted)).toBe(false)
    expect(res.items.some((i) => i.id === seeded.apiPending)).toBe(true)
  })

  it('date_to is inclusive — entries created at midnight on the boundary day are kept', async () => {
    // formDeleted is at 2026-02-15T00:00:00Z. With a naive `<= dateTo`
    // comparison against the bare YYYY-MM-DD this row would drop because
    // its timestamp string compares above '2026-02-15'. The route
    // translates to `created_at < date(?, '+1 day')`, which keeps it.
    const res = await listEntries('date_to=2026-02-15')
    expect(res.items.some((i) => i.id === seeded.formDeleted)).toBe(true)
    expect(res.items.some((i) => i.id === seeded.apiPending)).toBe(false)
  })

  it('combined date_from + date_to yields a closed-interval window', async () => {
    const res = await listEntries('date_from=2026-02-01&date_to=2026-03-31')
    const ids = res.items.map((i) => i.id)
    expect(ids).toContain(seeded.formDeleted)
    expect(ids).toContain(seeded.apiPending)
    expect(ids).not.toContain(seeded.formLive)
    expect(ids).not.toContain(seeded.formReportLive)
  })
})

describe('GET /api/admin/entries — sort axis', () => {
  it('default sort is desc (newest first)', async () => {
    const res = await listEntries('')
    const dates = res.items.map((i) => i.createdAt)
    const sorted = [...dates].sort().reverse()
    expect(dates).toEqual(sorted)
  })

  it('sort=asc returns oldest-first', async () => {
    const res = await listEntries('sort=asc')
    const dates = res.items.map((i) => i.createdAt)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
    // Sanity: with our 4 seeded fixtures and no other rows, the first
    // element should be the oldest seeded row.
    expect(res.items[0]?.id).toBe(seeded.formLive)
  })

  it('rejects unknown sort values with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/entries?sort=random',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
  })
})
