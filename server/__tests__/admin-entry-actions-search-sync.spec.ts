// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { SearchDoc, SearchEntryType, SearchHit, SearchIndex } from '../search/index.js'

/*
 * Lock the search-sync side-effect on every admin entry action.
 *
 * admin-queue-actions.spec covers the queue (approve/reject) path. This
 * spec covers the *general* /api/admin/entries/:id/action path —
 * delete, restore, and the purge endpoint — for both posts and reports.
 *
 * If a future refactor moved the syncEntryStatusAsync call out of any
 * one of these branches, deleted entries would still display in
 * Meilisearch results until the next manual reindex. The shape of that
 * bug is exactly the kind of partial regression admin-contract specs
 * cannot catch (the schema-level response stays valid; only the
 * downstream indexer state diverges).
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-admin-entry-search-'))
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

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  recorder = new RecordingSearch()
  ;(app as unknown as { searchIndex: SearchIndex }).searchIndex = recorder

  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('search-sync-ops@admin.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'search-sync-ops@admin.ai', password: 'testpassword12' },
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

describe('POST /api/admin/entries/:id/action — delete', () => {
  it('removes the post from the search index when an admin soft-deletes it', async () => {
    const post = await app.store.insertPost({
      firstName: 'DeleteMe',
      city: 'Austin',
      country: 'US',
      text: 'should leave the search index',
      clientIpHash: null,
      source: 'form',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/action`,
      headers: { cookie },
      payload: { action: 'delete', reason: 'spam' },
    })
    expect(res.statusCode).toBe(200)

    await waitFor(() => recorder.removeCalls.some((c) => c.id === post.id))
    const removed = recorder.removeCalls.find((c) => c.id === post.id)
    expect(removed?.type).toBe('posts')
    // Delete must NEVER index — only remove. A symmetric bug (always
    // call indexEntry then removeEntry) would re-publish the row before
    // dropping it, exposing the deleted text to a search consumer that
    // happens to query during the gap.
    expect(recorder.indexCalls.find((c) => c.doc.id === post.id)).toBe(undefined)
  })

  it('removes the report from the search index when an admin soft-deletes it', async () => {
    const report = await app.store.insertReport({
      reporterFirstName: null,
      reporterCity: null,
      reporterCountry: null,
      reportedFirstName: 'DeleteReport',
      reportedCity: 'Oslo',
      reportedCountry: 'NO',
      text: 'report should leave the search index',
      actionDate: null,
      severity: null,
      selfReportedModel: null,
      clientIpHash: null,
      source: 'form',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${report.id}/action`,
      headers: { cookie },
      payload: { action: 'delete', reason: 'spam' },
    })
    expect(res.statusCode).toBe(200)

    await waitFor(() => recorder.removeCalls.some((c) => c.id === report.id))
    const removed = recorder.removeCalls.find((c) => c.id === report.id)
    expect(removed?.type).toBe('reports')
  })
})

describe('POST /api/admin/entries/:id/action — restore', () => {
  it('re-indexes a restored post', async () => {
    const post = await app.store.insertPost({
      firstName: 'RestoreMe',
      city: 'NYC',
      country: 'US',
      text: 'will be restored after a soft-delete',
      clientIpHash: null,
      source: 'form',
    })
    // Soft-delete first.
    await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/action`,
      headers: { cookie },
      payload: { action: 'delete' },
    })
    await waitFor(() => recorder.removeCalls.some((c) => c.id === post.id))
    recorder.reset()

    // Restore.
    const restore = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/action`,
      headers: { cookie },
      payload: { action: 'restore' },
    })
    expect(restore.statusCode).toBe(200)

    await waitFor(() => recorder.indexCalls.some((c) => c.doc.id === post.id))
    const indexed = recorder.indexCalls.find((c) => c.doc.id === post.id)
    expect(indexed?.type).toBe('posts')
    expect(indexed?.doc).toMatchObject({ status: 'live', first_name: 'RestoreMe' })
    // Restoration MUST NOT also remove. Otherwise the restore would
    // be a no-op as far as the search index is concerned.
    expect(recorder.removeCalls.find((c) => c.id === post.id)).toBe(undefined)
  })
})

describe('POST /api/admin/entries/:id/purge — search-index eviction', () => {
  it('removes the row from the search index when purged', async () => {
    const post = await app.store.insertPost({
      firstName: 'PurgeMe',
      city: 'Berlin',
      country: 'DE',
      text: 'should be evicted from the search index',
      clientIpHash: null,
      source: 'form',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/purge`,
      headers: { cookie },
      payload: { confirmation: `${post.id} PURGE`, reason: 'GDPR' },
    })
    expect(res.statusCode).toBe(200)

    await waitFor(() => recorder.removeCalls.some((c) => c.id === post.id))
    const removed = recorder.removeCalls.find((c) => c.id === post.id)
    expect(removed?.type).toBe('posts')
  })

  it('does NOT touch the search index when the purge confirmation string is wrong', async () => {
    // Wrong confirmation 400s before any side effect runs. A regression
    // that fired the search-sync optimistically would leak the row into
    // a "removed but still present" state when the SQL update never
    // happened.
    const post = await app.store.insertPost({
      firstName: 'WrongConfirm',
      city: 'NYC',
      country: 'US',
      text: 'should NOT touch search',
      clientIpHash: null,
      source: 'form',
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${post.id}/purge`,
      headers: { cookie },
      payload: { confirmation: 'wrong', reason: 'oops' },
    })
    expect(res.statusCode).toBe(400)

    // Brief flush so any rogue async sync would have landed.
    await new Promise<void>((r) => setTimeout(r, 30))
    expect(recorder.removeCalls.find((c) => c.id === post.id)).toBe(undefined)
    expect(recorder.indexCalls.find((c) => c.doc.id === post.id)).toBe(undefined)
  })
})
