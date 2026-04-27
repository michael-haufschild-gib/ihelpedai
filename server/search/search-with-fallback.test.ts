// @vitest-environment node
import type { FastifyBaseLogger } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import type { SearchHit, SearchIndex } from './index.js'
import { searchWithFallback } from './search-with-fallback.js'

/*
 * Direct unit coverage for `searchWithFallback`. The integration path
 * (search-wiring.spec.ts) exercises the happy + index-throws paths via
 * the live route handler. This spec covers the third branch — hydration
 * mismatch — which catches a real bug class:
 *
 *   The search index returns ids that no longer exist in the store
 *   because a status transition (delete, restore) hasn't propagated yet.
 *   Without the fallback, the user sees an empty page even though
 *   matching live rows exist; total > rows.length screws pagination.
 *
 * The fallback is the tie-breaker that keeps results consistent.
 */

interface FakeLog {
  error: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  debug: ReturnType<typeof vi.fn>
  trace: ReturnType<typeof vi.fn>
  fatal: ReturnType<typeof vi.fn>
}

function makeFakeLog(): FakeLog {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }
}

/**
 * Cast a FakeLog to the FastifyBaseLogger shape expected by the helper. The
 * helper only ever calls `error` / `warn`; the rest of the FastifyBaseLogger
 * surface is unused, so a partial stub plus a type assertion is the minimum
 * viable test scaffolding.
 */
function asLogger(fake: FakeLog): FastifyBaseLogger {
  return fake as unknown as FastifyBaseLogger
}

const noopLog = asLogger(makeFakeLog())

function makeSearch(result: SearchHit | Error): SearchIndex {
  return {
    ensureSetup: async () => undefined,
    search: async () => {
      if (result instanceof Error) throw result
      return result
    },
    indexEntry: async () => undefined,
    indexMany: async () => undefined,
    removeEntry: async () => undefined,
    resetIndex: async () => undefined,
  }
}

describe('searchWithFallback — happy path', () => {
  it('returns hydrated rows + total straight from the search index when ids match', async () => {
    const fallback = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const result = await searchWithFallback<{ id: string }>({
      search: makeSearch({ ids: ['a', 'b'], total: 2 }),
      type: 'posts',
      query: 'q',
      page: 1,
      hitsPerPage: 20,
      hydrate: async (ids) => ids.map((id) => ({ id })),
      fallback,
      log: noopLog,
    })
    expect(result).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], total: 2 })
    // Critical: fallback is NEVER called on the happy path. A regression
    // that always-fell-back would slow every search query 2x by running
    // both the index AND the SQL scan.
    expect(fallback).not.toHaveBeenCalled()
  })
})

describe('searchWithFallback — index throws', () => {
  it('returns fallback rows + total and logs at error', async () => {
    const fallback = vi.fn().mockResolvedValue({ rows: [{ id: 'fb1' }, { id: 'fb2' }], total: 2 })
    const log = makeFakeLog()
    const result = await searchWithFallback<{ id: string }>({
      search: makeSearch(new Error('meili down')),
      type: 'reports',
      query: 'q',
      page: 1,
      hitsPerPage: 20,
      hydrate: async () => {
        throw new Error('hydrate should not run when search throws')
      },
      fallback,
      log: asLogger(log),
    })
    expect(result).toEqual({ rows: [{ id: 'fb1' }, { id: 'fb2' }], total: 2 })
    expect(fallback).toHaveBeenCalledTimes(1)
    // The error log must fire so observability picks up the outage. Without
    // this assertion, a refactor that silently swallowed the error (no log)
    // would still satisfy the "fallback wins" branch but blind the on-call
    // engineer to a degraded service.
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'search', type: 'reports' }),
      'search_failed_fallback',
    )
  })
})

describe('searchWithFallback — hydration mismatch', () => {
  it('falls back when hydrated rows are fewer than ids returned (stale index)', async () => {
    // Search index says 3 ids exist, but only 2 hydrate (the third row
    // was deleted/marked non-live since the index last updated). Treat
    // as stale: rebuild the page from the authoritative store.
    const fallback = vi.fn().mockResolvedValue({
      rows: [{ id: 'live-1' }, { id: 'live-2' }, { id: 'live-3' }],
      total: 3,
    })
    const log = makeFakeLog()
    const result = await searchWithFallback<{ id: string }>({
      search: makeSearch({ ids: ['a', 'b', 'c'], total: 3 }),
      type: 'posts',
      query: 'q',
      page: 1,
      hitsPerPage: 20,
      hydrate: async () => [{ id: 'a' }, { id: 'b' }],
      fallback,
      log: asLogger(log),
    })
    expect(result).toEqual({
      rows: [{ id: 'live-1' }, { id: 'live-2' }, { id: 'live-3' }],
      total: 3,
    })
    expect(fallback).toHaveBeenCalledTimes(1)
    // Mismatch is logged at warn (not error) — the index will catch up
    // after the next sync, so on-call should know but not page.
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'search',
        type: 'posts',
        requested: 3,
        hydrated: 2,
      }),
      'search_hydration_mismatch_fallback',
    )
  })

  it('does NOT fall back when ids and rows are both empty (no false mismatch)', async () => {
    // ids.length === rows.length === 0 is the "no match" happy path,
    // not a mismatch. Without this lock, an empty-result search would
    // burn an extra fallback round-trip on every miss.
    const fallback = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const result = await searchWithFallback<{ id: string }>({
      search: makeSearch({ ids: [], total: 0 }),
      type: 'posts',
      query: 'no-match-query',
      page: 1,
      hitsPerPage: 20,
      hydrate: async () => [],
      fallback,
      log: noopLog,
    })
    expect(result).toEqual({ rows: [], total: 0 })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back when hydration throws (treated like an outage)', async () => {
    const fallback = vi.fn().mockResolvedValue({ rows: [{ id: 'x' }], total: 1 })
    const result = await searchWithFallback<{ id: string }>({
      search: makeSearch({ ids: ['a'], total: 1 }),
      type: 'posts',
      query: 'q',
      page: 1,
      hitsPerPage: 20,
      hydrate: async () => {
        throw new Error('store down during hydrate')
      },
      fallback,
      log: noopLog,
    })
    // The catch block in searchWithFallback treats hydrate errors like
    // index errors — same observability path, same fallback. Without
    // this branch, a transient store hiccup mid-search would surface
    // as a 500 to the user.
    expect(result).toEqual({ rows: [{ id: 'x' }], total: 1 })
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})
