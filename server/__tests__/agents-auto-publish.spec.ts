// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SearchDoc, SearchEntryType, SearchHit, SearchIndex } from '../search/index.js'

/*
 * Behavioural lock for the auto_publish_agents=true branch + the
 * GET /api/agents/recent feed endpoint.
 *
 * The default test path covered by api-contract.spec uses
 * auto_publish_agents=false (the production default) — agent reports go to
 * the moderation queue and respond `status: 'pending'`. Flipping the
 * setting changes the response, the persisted status, AND must enqueue a
 * search-index call. None of those side effects had a dedicated test.
 *
 * GET /api/agents/recent serves the public "recent agent reports" widget.
 * Its filter (source='api') and the implicit live-only behaviour are
 * untested elsewhere — a refactor that switched to listAgentReports
 * without source/status restriction would silently leak deleted reports
 * onto the public page.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-agents-publish-'))
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

const DEV_KEY = 'agents-auto-publish-key-do-not-reuse'

let app: FastifyInstance
let recorder: RecordingSearch

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise<void>((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor timed out')
}

const validPayload = (suffix: string) => ({
  api_key: DEV_KEY,
  reported_first_name: 'Jamie',
  reported_last_name: 'Doe',
  reported_city: 'Paris',
  reported_country: 'FR',
  what_they_did: `auto-publish probe ${suffix}`,
  self_reported_model: 'auto-publish-bot',
})

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  const { hashWithSalt } = await import('../lib/salted-hash.js')
  app = await buildApp()
  recorder = new RecordingSearch()
  ;(app as unknown as { searchIndex: SearchIndex }).searchIndex = recorder

  await app.store.insertApiKey({
    keyHash: hashWithSalt(DEV_KEY),
    keyLast4: DEV_KEY.slice(-4),
    emailHash: hashWithSalt('autopub-agent@ihelped.ai'),
    status: 'active',
  })
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/agents/report — auto_publish_agents=true branch', () => {
  it('returns status="posted" and indexes the report when auto_publish_agents=true', async () => {
    recorder.reset()
    await app.store.setSetting('auto_publish_agents', 'true')
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/report',
        payload: validPayload('autopub-on'),
      })
      expect(res.statusCode).toBe(201)
      const body = res.json() as { entry_id: string; status: string }
      // The response status flips from 'pending' (default queue path) to
      // 'posted'. Without the setting check, callers would see 'pending'
      // and never know admin had enabled bypass.
      expect(body.status).toBe('posted')

      // The persisted row's status must be 'live' for it to flow through
      // public list endpoints.
      const stored = await app.store.getReport(body.entry_id)
      expect(stored?.status).toBe('live')

      // The search index must receive an indexEntry call for this row,
      // fire-and-forget. A regression that only auto-published but never
      // indexed would leave the report invisible to search until a manual
      // reindex.
      await waitFor(() => recorder.indexCalls.some((c) => c.doc.id === body.entry_id))
      const indexed = recorder.indexCalls.find((c) => c.doc.id === body.entry_id)
      expect(indexed?.type).toBe('reports')
    } finally {
      await app.store.setSetting('auto_publish_agents', 'false')
    }
  })

  it('returns status="pending" and does NOT index when auto_publish_agents is unset', async () => {
    recorder.reset()
    // Default state — explicitly clear the setting just to be safe.
    await app.store.setSetting('auto_publish_agents', 'false')

    const res = await app.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: validPayload('autopub-off'),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { entry_id: string; status: string }
    expect(body.status).toBe('pending')

    const stored = await app.store.getReport(body.entry_id)
    expect(stored?.status).toBe('pending')

    // Brief flush — the route does NOT call indexEntry on the pending
    // path. A regression that always indexed (regardless of auto-publish)
    // would surface the row in search before an admin saw it.
    await new Promise<void>((r) => setTimeout(r, 30))
    expect(recorder.indexCalls.some((c) => c.doc.id === body.entry_id)).toBe(false)
  })
})

describe('GET /api/agents/recent — feed filter', () => {
  it('lists only api-source live reports; excludes form-source and non-live api', async () => {
    // Form-source report — should never appear here regardless of status.
    const formReport = await app.store.insertReport({
      reporterFirstName: null,
      reporterCity: null,
      reporterCountry: null,
      reportedFirstName: 'FormPerson',
      reportedCity: 'Berlin',
      reportedCountry: 'DE',
      text: `form report should not appear in agents/recent ${String(Date.now())}`,
      actionDate: null,
      severity: null,
      selfReportedModel: null,
      clientIpHash: null,
      source: 'form',
    })

    // insertAgentReport asserts the api-key hash row exists and is active,
    // so reuse the seeded DEV_KEY hash from beforeAll.
    const { hashWithSalt } = await import('../lib/salted-hash.js')
    const seededHash = hashWithSalt(DEV_KEY)

    // Pending api-source — must NOT appear in the feed.
    const pendingApi = await app.store.insertAgentReport(
      {
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: 'PendingApi',
        reportedCity: 'Paris',
        reportedCountry: 'FR',
        text: `pending api report should not appear ${String(Date.now())}`,
        actionDate: null,
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'api',
      },
      seededHash,
      'pending',
    )

    // Live api-source — must appear.
    const liveApi = await app.store.insertAgentReport(
      {
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: 'LiveApi',
        reportedCity: 'Paris',
        reportedCountry: 'FR',
        text: `live api report should appear ${String(Date.now())}`,
        actionDate: null,
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'api',
      },
      seededHash,
      'live',
    )

    const res = await app.inject({ method: 'GET', url: '/api/agents/recent' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { slug: string; submitted_via_api: boolean }[] }
    const ids = body.items.map((i) => i.slug)
    expect(ids).toContain(liveApi.id)
    expect(ids).not.toContain(formReport.id)
    expect(ids).not.toContain(pendingApi.id)
    // Every item must be marked submitted_via_api=true.
    expect(body.items.every((i) => i.submitted_via_api === true)).toBe(true)
  })

  it('returns at most 20 items per page', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents/recent' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: unknown[]; page: number; page_size: number }
    expect(body.items.length).toBeLessThanOrEqual(20)
    expect(body.page).toBe(1)
    expect(body.page_size).toBe(20)
  })
})

describe('POST /api/agents/report — submission_freeze branch', () => {
  it('returns 503 internal_error with a user-readable message when submission_freeze=true', async () => {
    // submission_freeze blocks BEFORE rate limit and BEFORE storage.
    // Verifying the 503 path is critical: an attacker spamming during
    // a freeze should not even consume rate-limit budget.
    await app.store.setSetting('submission_freeze', 'true')
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agents/report',
        payload: validPayload('frozen'),
      })
      expect(res.statusCode).toBe(503)
      const body = res.json() as { error: string; message: string }
      expect(body.error).toBe('internal_error')
      expect(body.message).toContain('disabled')
    } finally {
      await app.store.setSetting('submission_freeze', 'false')
    }
  })
})
