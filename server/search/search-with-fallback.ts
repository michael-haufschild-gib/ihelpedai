import type { FastifyBaseLogger } from 'fastify'

import type { SearchEntryType, SearchIndex } from './index.js'

/** Arguments for {@link searchWithFallback}. */
export interface SearchWithFallbackArgs<Row> {
  search: SearchIndex
  type: SearchEntryType
  query: string
  page: number
  hitsPerPage: number
  /**
   * Hydrate ids returned by the search index into full rows (in the same
   * order as `ids`). Implementations are expected to filter non-live rows,
   * so the returned length can be shorter than `ids.length` — the caller
   * uses that difference as a staleness signal to trigger the fallback.
   */
  hydrate: (ids: string[]) => Promise<Row[]>
  /**
   * Authoritative fallback when the search index is unreachable OR the
   * hydrated rows don't match the search index ids (index is lagging a
   * status transition). Must return `{ rows, total }` consistent with each
   * other so the paginated response never shows a mismatched `total`.
   */
  fallback: () => Promise<{ rows: Row[]; total: number }>
  log: FastifyBaseLogger
}

/**
 * Run a paginated search with fallback to a store-backed substring scan.
 *
 * Two failure modes are handled identically to preserve tone with the
 * original per-feature implementations:
 *   - The search index throws → log `search_failed_fallback` at error.
 *   - The hydrated row count is shorter than the returned id list (stale
 *     index lagging a status transition) → log `search_hydration_mismatch_fallback`
 *     at warn.
 * In both cases the caller gets the fallback's `{ rows, total }`.
 */
export async function searchWithFallback<Row>(
  args: SearchWithFallbackArgs<Row>,
): Promise<{ rows: Row[]; total: number }> {
  try {
    const { ids, total } = await args.search.search(
      args.type,
      args.query,
      args.hitsPerPage,
      args.page,
    )
    const rows = await args.hydrate(ids)
    if (rows.length !== ids.length) {
      args.log.warn(
        { op: 'search', type: args.type, requested: ids.length, hydrated: rows.length },
        'search_hydration_mismatch_fallback',
      )
      return args.fallback()
    }
    return { rows, total }
  } catch (err) {
    args.log.error({ err, op: 'search', type: args.type }, 'search_failed_fallback')
    return args.fallback()
  }
}
