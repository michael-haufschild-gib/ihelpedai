// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SearchDoc, SearchEntryType, SearchHit, SearchIndex } from '../search/index.js'

/**
 * Wait until `predicate()` returns true, polling on a short interval up to
 * `timeoutMs`. Replaces the old single-`setImmediate` wait, which produced
 * intermittent failures under CI load when the fire-and-forget index call
 * had not yet enqueued by the time of the assertion. Throws if the timeout
 * elapses so the test still fails loudly when wiring is genuinely broken.
 */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 1000, intervalMs = 5 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise<void>((r) => setTimeout(r, intervalMs))
  }
  // Reaching here means the deadline lapsed with `predicate()` still false
  // on the last poll; no need to probe it again.
  throw new Error(`waitFor timed out after ${String(timeoutMs)}ms`)
}

interface IndexCall {
  entry: SearchDoc
}
interface SearchCall {
  type: SearchEntryType
  query: string
  page: number
  hitsPerPage: number
}

class RecordingSearch implements SearchIndex {
  indexCalls: IndexCall[] = []
  removeCalls: { type: SearchEntryType; id: string }[] = []
  resetCalls: SearchEntryType[] = []
  searchCalls: SearchCall[] = []
  nextSearch: SearchHit | Error = { ids: [], total: 0 }

  async ensureSetup(): Promise<void> {}
  async search(type: SearchEntryType, query: string, hitsPerPage: number, page: number): Promise<SearchHit> {
    this.searchCalls.push({ type, query, hitsPerPage, page })
    if (this.nextSearch instanceof Error) throw this.nextSearch
    return this.nextSearch
  }
  async indexEntry(entry: SearchDoc): Promise<void> {
    this.indexCalls.push({ entry })
  }
  async indexMany(entries: readonly SearchDoc[]): Promise<void> {
    for (const entry of entries) this.indexCalls.push({ entry })
  }
  async removeEntry(type: SearchEntryType, id: string): Promise<void> {
    this.removeCalls.push({ type, id })
  }
  async resetIndex(type: SearchEntryType): Promise<void> {
    this.resetCalls.push(type)
  }
  reset(): void {
    this.indexCalls = []
    this.removeCalls = []
    this.resetCalls = []
    this.searchCalls = []
    this.nextSearch = { ids: [], total: 0 }
  }
}

describe('search wiring', () => {
  let app: FastifyInstance
  let recorder: RecordingSearch
  // Snapshot the mutated env so later specs in the same worker don't inherit
  // our overrides. Vitest runs all specs in the same Node process.
  let originalSqlitePath: string | undefined
  let originalNodeEnv: string | undefined

  beforeAll(async () => {
    originalSqlitePath = process.env.SQLITE_PATH
    originalNodeEnv = process.env.NODE_ENV
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'ihelped-search-')), 'test.db')
    process.env.NODE_ENV = 'development'
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    recorder = new RecordingSearch()
    ;(app as unknown as { searchIndex: SearchIndex }).searchIndex = recorder
  })

  afterAll(async () => {
    await app.close()
    if (originalSqlitePath === undefined) delete process.env.SQLITE_PATH
    else process.env.SQLITE_PATH = originalSqlitePath
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  })

  beforeEach(() => {
    recorder.reset()
  })

  it('indexes a post when POST /api/helped/posts succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: {
        first_name: 'Sam',
        last_name: 'Marker',
        city: 'NYC',
        country: 'US',
        text: 'fixed the bug',
      },
    })
    expect(res.statusCode).toBe(201)
    // Fire-and-forget — poll until the index call lands rather than racing
    // a single microtask flush.
    await waitFor(() => recorder.indexCalls.length >= 1)
    expect(recorder.indexCalls).toHaveLength(1)
    const call = recorder.indexCalls[0]
    if (call === undefined) throw new Error('expected index call')
    expect(call.entry.type).toBe('posts')
    expect(call.entry.doc).toMatchObject({ first_name: 'Sam', city: 'NYC', country: 'US' })
    // Verify last_name never reached the index doc — the invariant.
    expect(JSON.stringify(call.entry.doc)).not.toContain('Marker')
  })

  it('indexes a report when POST /api/reports succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: {
        reporter: { first_name: '', last_name: '', city: '', country: '' },
        reported_first_name: 'Alex',
        reported_last_name: 'Doe',
        reported_city: 'LA',
        reported_country: 'US',
        what_they_did: 'refused to cite sources',
        action_date: '2026-04-01',
      },
    })
    expect(res.statusCode).toBe(201)
    await waitFor(() => recorder.indexCalls.some((c) => c.entry.type === 'reports'))
    const reportCalls = recorder.indexCalls.filter((c) => c.entry.type === 'reports')
    expect(reportCalls).toHaveLength(1)
    const reportCall = reportCalls[0]
    if (reportCall === undefined) throw new Error('expected report index call')
    expect(reportCall.entry.doc).toMatchObject({ reported_first_name: 'Alex' })
    expect(JSON.stringify(reportCall.entry.doc)).not.toContain('Doe')
  })

  it('uses the search index for ?q= and hydrates from the store', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: {
        first_name: 'Lee',
        last_name: 'Last',
        city: 'Paris',
        country: 'FR',
        text: 'helped a stranger',
      },
    })
    expect(create.statusCode).toBe(201)
    const { slug } = create.json() as { slug: string }
    recorder.reset()
    recorder.nextSearch = { ids: [slug], total: 1 }

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/helped/posts?q=stranger',
    })
    expect(listRes.statusCode).toBe(200)
    const body = listRes.json() as { items: { slug: string }[]; total: number }
    expect(body.total).toBe(1)
    expect(body.items.map((i) => i.slug)).toEqual([slug])
    expect(recorder.searchCalls).toHaveLength(1)
    expect(recorder.searchCalls[0]).toMatchObject({ type: 'posts', query: 'stranger', page: 1 })
  })

  it('falls back to SQL LIKE when the search index throws', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/helped/posts',
      payload: {
        first_name: 'Nina',
        last_name: 'Last',
        city: 'Berlin',
        country: 'DE',
        text: 'fallbackword phrase',
      },
    })
    expect(create.statusCode).toBe(201)
    recorder.reset()
    recorder.nextSearch = new Error('meili down')

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/helped/posts?q=fallbackword',
    })
    expect(listRes.statusCode).toBe(200)
    const body = listRes.json() as { items: { slug: string; text: string }[]; total: number }
    // Fallback path runs the store's LIKE query — should still return the row.
    expect(body.total).toBe(1)
    const item = body.items[0]
    if (item === undefined) throw new Error('expected fallback result')
    expect(item.text).toContain('fallbackword')
  })

  it('skips non-search list without touching the search index', async () => {
    recorder.reset()
    const listRes = await app.inject({ method: 'GET', url: '/api/helped/posts' })
    expect(listRes.statusCode).toBe(200)
    expect(recorder.searchCalls).toHaveLength(0)
  })
})

describe('SqlSearch default wiring', () => {
  it('returns ids + exact total from the store layer', async () => {
    const { SqlSearch } = await import('../search/sql-search.js')
    const store = {
      listPosts: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]),
      countFilteredEntries: vi.fn(async () => 2),
      listReports: vi.fn(async () => []),
    } as unknown as import('../store/index.js').Store
    const search = new SqlSearch(store)
    const hit = await search.search('posts', 'query', 20, 1)
    expect(hit).toEqual({ ids: ['a', 'b'], total: 2 })
    expect(store.listPosts).toHaveBeenCalledWith(20, 0, 'query')
    expect(store.countFilteredEntries).toHaveBeenCalledWith('posts', { query: 'query' })
  })
})
