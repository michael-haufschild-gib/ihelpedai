import type { EntryStatus, EntrySource } from '../store/index.js'

/** Searchable entry type. */
export type SearchEntryType = 'posts' | 'reports'

/** Serialisable shape of a post stored in the search index. */
export type PostSearchDoc = {
  id: string
  first_name: string
  city: string
  country: string
  text: string
  status: EntryStatus
  source: EntrySource
  created_at: string
}

/** Serialisable shape of a report stored in the search index. */
export type ReportSearchDoc = {
  id: string
  reported_first_name: string
  reported_city: string
  reported_country: string
  reporter_first_name: string | null
  text: string
  status: EntryStatus
  source: EntrySource
  created_at: string
}

/** Discriminated doc union used by indexEntry. */
export type SearchDoc =
  | { type: 'posts'; doc: PostSearchDoc }
  | { type: 'reports'; doc: ReportSearchDoc }

/** Result of a search: ids in rank order, plus exact total hits. */
export type SearchHit = {
  ids: string[]
  total: number
}

/**
 * Search abstraction. Dev impl delegates to the store's SQL LIKE filter;
 * prod impl mirrors writes to Meilisearch and reads from it. Indexes are
 * namespaced to this project so the shared Meili host stays safe.
 */
export interface SearchIndex {
  /** Create indexes + apply searchable/filterable/sortable settings. Idempotent. */
  ensureSetup(): Promise<void>

  /**
   * Return ids (in rank order) matching `query` plus the exact total matching
   * document count. Only live rows are returned.
   */
  search(
    type: SearchEntryType,
    query: string,
    hitsPerPage: number,
    page: number,
  ): Promise<SearchHit>

  /** Upsert a single document. Only `live` docs should be indexed. */
  indexEntry(entry: SearchDoc): Promise<void>

  /**
   * Bulk-upsert a batch of documents. Implementations are expected to issue
   * one index task per entry type rather than one per document, which is
   * essential for reindex throughput against Meili (N round-trips collapse
   * to 1). Entries may be mixed-type; impls partition internally.
   */
  indexMany(entries: readonly SearchDoc[]): Promise<void>

  /** Remove a document by id. Called on status transitions away from `live`. */
  removeEntry(type: SearchEntryType, id: string): Promise<void>

  /**
   * Drop every document in the given index. Called by the reindex script
   * before backfilling, so stale docs for rows that were purged (and whose
   * remove hook was missed) don't linger in search results.
   */
  resetIndex(type: SearchEntryType): Promise<void>
}
