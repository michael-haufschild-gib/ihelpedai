// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { SearchDoc, SearchEntryType, SearchHit, SearchIndex } from '../search/index.js'

/*
 * Behavioural lock for admin moderation queue actions.
 *
 * Production paths under test (server/routes/admin/queue.ts):
 *   POST /api/admin/queue/:id/action     { action: 'approve' | 'reject' }
 *   POST /api/admin/queue/bulk           { ids[], action: 'approve' | 'reject' }
 *
 * Invariants that admin-contract.spec only schema-checks but does not
 * exercise:
 *   - approve transitions a `pending` entry → `live`
 *   - reject transitions a `pending` entry → `deleted` (not 'rejected')
 *   - non-pending entries return 404 ("the queue") regardless of existence
 *   - bulk preserves per-id ok/not_ok flags so the UI can render partial
 *     success even when some ids vanished mid-batch
 *   - search index updates after each action — approve indexes the live
 *     row, reject removes it. The fire-and-forget syncEntryStatusAsync
 *     wrapping means tests must wait for the search call to land.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-admin-queue-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

class RecordingSearch implements SearchIndex {
  indexCalls: SearchDoc[] = []
  removeCalls: { type: SearchEntryType; id: string }[] = []
  async ensureSetup(): Promise<void> {}
  async search(): Promise<SearchHit> {
    return { ids: [], total: 0 }
  }
  async indexEntry(entry: SearchDoc): Promise<void> {
    this.indexCalls.push(entry)
  }
  async indexMany(entries: readonly SearchDoc[]): Promise<void> {
    this.indexCalls.push(...entries)
  }
  async removeEntry(type: SearchEntryType, id: string): Promise<void> {
    this.removeCalls.push({ type, id })
  }
  async resetIndex(): Promise<void> {}
  reset(): void {
    this.indexCalls = []
    this.removeCalls = []
  }
}

let app: FastifyInstance
let cookie = ''
let recorder: RecordingSearch

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise<void>((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor timed out')
}

async function insertPendingApiReport(label: string): Promise<string> {
  const apiKeyHash = `dummy-keyhash-${label}-${String(Math.random())}`
  await app.store.insertApiKey({
    keyHash: apiKeyHash,
    keyLast4: 'last',
    emailHash: `dummy-emailhash-${label}`,
    status: 'active',
  })
  const report = await app.store.insertAgentReport(
    {
      reporterFirstName: null,
      reporterCity: null,
      reporterCountry: null,
      reportedFirstName: 'Queued',
      reportedCity: 'Paris',
      reportedCountry: 'FR',
      text: `pending queue ${label}`,
      actionDate: '2026-04-26',
      severity: 4,
      selfReportedModel: 'queue-bot',
      clientIpHash: null,
      source: 'api',
    },
    apiKeyHash,
    'pending',
  )
  return report.id
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  recorder = new RecordingSearch()
  ;(app as unknown as { searchIndex: SearchIndex }).searchIndex = recorder

  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('queue-ops@admin.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'queue-ops@admin.ai', password: 'testpassword12' },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(cookie).not.toBe('')
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  recorder.reset()
})

describe('POST /api/admin/queue/:id/action — approve transition', () => {
  it('moves a pending agent report to live and indexes it for search', async () => {
    const id = await insertPendingApiReport('approve-target')

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${id}/action`,
      headers: { cookie },
      payload: { action: 'approve' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', entry_id: id, action: 'approve' })

    // Status must read back as 'live' (not 'approved' or anything else —
    // 'live' is the canonical post-approval status).
    const detail = await app.store.getAdminEntryDetail(id)
    expect(detail?.status).toBe('live')

    // Approving must enqueue the report for search-index inclusion. The
    // sync fires fire-and-forget so we poll until it lands.
    await waitFor(() => recorder.indexCalls.length >= 1)
    const indexed = recorder.indexCalls.find((c) => c.type === 'reports' && c.doc.id === id)
    expect(indexed).not.toBe(undefined)
    expect(indexed?.doc).toMatchObject({ status: 'live' })

    // It also must NOT have been removed from the index — a buggy sync
    // that always called removeEntry would still index, then drop.
    expect(recorder.removeCalls.find((c) => c.id === id)).toBe(undefined)
  })

  it('records an audit row for "approve" with the admin as actor', async () => {
    const id = await insertPendingApiReport('approve-audit')
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${id}/action`,
      headers: { cookie },
      payload: { action: 'approve', reason: 'looks fine' },
    })
    expect(res.statusCode).toBe(200)
    const audits = await app.store.listAuditLogForTarget(id)
    const approve = audits.find((a) => a.action === 'approve')
    expect(approve).not.toBe(undefined)
    expect(approve?.adminId).not.toBe(null)
  })
})

describe('POST /api/admin/queue/:id/action — reject transition', () => {
  it('moves a pending agent report to deleted and removes it from the search index', async () => {
    const id = await insertPendingApiReport('reject-target')

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${id}/action`,
      headers: { cookie },
      payload: { action: 'reject', reason: 'looks like spam' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ entry_id: id, action: 'reject' })

    const detail = await app.store.getAdminEntryDetail(id)
    // Reject collapses to 'deleted' under the hood. There is no separate
    // 'rejected' enum value — both terminal states are 'deleted'. This
    // is the surprising bit a reader might miss without a test.
    expect(detail?.status).toBe('deleted')

    // The entry was never indexed (it was pending), so a removeEntry call
    // is more important than the absence of indexEntry — locking the
    // "evict from search just in case" defensive behaviour.
    await waitFor(() => recorder.removeCalls.length >= 1)
    const removed = recorder.removeCalls.find((c) => c.id === id)
    expect(removed).not.toBe(undefined)
    expect(removed?.type).toBe('reports')
  })
})

describe('POST /api/admin/queue/:id/action — non-pending entries are 404', () => {
  it('returns 404 when the entry is already live (not in the queue)', async () => {
    const id = await insertPendingApiReport('already-live')
    // Pre-approve so the next queue action sees a non-pending row.
    await app.store.updateEntryStatus(id, 'report', 'live')

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${id}/action`,
      headers: { cookie },
      payload: { action: 'approve' },
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: string }).error).toBe('not_found')
  })

  it('returns 404 when the id does not exist at all', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/queue/aBcDeFgHiJ/action',
      headers: { cookie },
      payload: { action: 'approve' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/admin/queue/bulk — partial success', () => {
  it('returns ok=true for queued ids and ok=false for ids that are not pending', async () => {
    const queued = await insertPendingApiReport('bulk-queued')
    const alreadyLive = await insertPendingApiReport('bulk-already-live')
    await app.store.updateEntryStatus(alreadyLive, 'report', 'live')
    const fictional = 'aaaaaaaaaa'

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/queue/bulk',
      headers: { cookie },
      payload: { ids: [queued, alreadyLive, fictional], action: 'approve' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { results: Array<{ id: string; ok: boolean }> }
    // Order MUST be preserved so the UI can pair each result with the row
    // the admin selected. A future refactor switching to Promise.all without
    // ordering would silently scramble these.
    expect(body.results).toEqual([
      { id: queued, ok: true },
      { id: alreadyLive, ok: false },
      { id: fictional, ok: false },
    ])

    // Side-effect on the queued row must have applied even though the
    // batch had failures — partial success is the documented behaviour.
    expect((await app.store.getAdminEntryDetail(queued))?.status).toBe('live')

    // One audit row per applied id — NOT a single batch row. Auditors
    // need a per-target trail to reconstruct what changed. A regression
    // that combined the bulk into one audit entry would lose the
    // per-target attribution. Lock that the queued (successful) id has
    // a fresh `approve` audit row, while the failed ids do not.
    const queuedAudits = await app.store.listAuditLogForTarget(queued)
    expect(queuedAudits.some((a) => a.action === 'approve')).toBe(true)
    const fictionalAudits = await app.store.listAuditLogForTarget(fictional)
    expect(fictionalAudits.some((a) => a.action === 'approve')).toBe(false)
  })

  it('rejects an empty ids[] (Zod min)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/queue/bulk',
      headers: { cookie },
      payload: { ids: [], action: 'approve' },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('rejects ids[] longer than 100 (Zod max)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/queue/bulk',
      headers: { cookie },
      payload: { ids: Array.from({ length: 101 }, (_, i) => `id${String(i).padStart(8, 'x')}`), action: 'approve' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/admin/queue + count', () => {
  it('lists only pending api-source entries, not form posts and not live api reports', async () => {
    // Form posts must never show up in the agent moderation queue: only
    // api-source rows are gated, form is auto-published.
    const formPost = await app.store.insertPost({
      firstName: 'Form',
      city: 'NYC',
      country: 'US',
      text: 'shouldnt be queued',
      clientIpHash: null,
      source: 'form',
    })
    // Pending status alone is not enough — must also be source='api'.
    await app.store.updateEntryStatus(formPost.id, 'post', 'pending')

    const queuedApi = await insertPendingApiReport('queue-listing')

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/queue',
      headers: { cookie },
    })
    expect(list.statusCode).toBe(200)
    const body = list.json() as { items: Array<{ id: string; source: string; status: string }>; total: number }
    expect(body.items.every((i) => i.source === 'api' && i.status === 'pending')).toBe(true)
    expect(body.items.some((i) => i.id === queuedApi)).toBe(true)
    expect(body.items.some((i) => i.id === formPost.id)).toBe(false)
  })

  it('GET /api/admin/queue/count matches the listed count for the same filter', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/admin/queue', headers: { cookie } })
    const count = await app.inject({ method: 'GET', url: '/api/admin/queue/count', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(count.statusCode).toBe(200)
    const listBody = list.json() as { total: number }
    const countBody = count.json() as { count: number }
    expect(countBody.count).toBe(listBody.total)
  })
})
