import type { Store } from '../store/index.js'

import type { SearchDoc, SearchEntryType, SearchHit, SearchIndex } from './index.js'

/**
 * SQL LIKE-backed SearchIndex used in development and as a fallback when
 * Meilisearch is unavailable. Delegates to Store.listPosts / listReports
 * and uses Store.countFilteredEntries for accurate totals.
 */
export class SqlSearch implements SearchIndex {
  constructor(private readonly store: Store) {}

  async ensureSetup(): Promise<void> {
    // No schema to apply — the store's tables already back the LIKE queries.
  }

  async search(
    type: SearchEntryType,
    query: string,
    hitsPerPage: number,
    page: number,
  ): Promise<SearchHit> {
    const offset = Math.max(0, (page - 1) * hitsPerPage)
    if (type === 'posts') {
      const [rows, total] = await Promise.all([
        this.store.listPosts(hitsPerPage, offset, query),
        this.store.countFilteredEntries('posts', { query }),
      ])
      return { ids: rows.map((r) => r.id), total }
    }
    const [rows, total] = await Promise.all([
      this.store.listReports(hitsPerPage, offset, query),
      this.store.countFilteredEntries('reports', { query }),
    ])
    return { ids: rows.map((r) => r.id), total }
  }

  async indexEntry(_entry: SearchDoc): Promise<void> {
    // LIKE-backed index reads live rows straight from the store; no mirror.
  }

  async removeEntry(_type: SearchEntryType, _id: string): Promise<void> {
    // See indexEntry — nothing to remove.
  }
}
