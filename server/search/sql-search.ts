import type { Store } from '../store/index.js'

import type { SearchEntryType, SearchIndex } from './index.js'

/**
 * SQL LIKE-backed SearchIndex used in development. Delegates to the store's
 * existing list methods which already apply a substring filter.
 */
export class SqlSearch implements SearchIndex {
  constructor(private readonly store: Store) {}

  async search(
    type: SearchEntryType,
    query: string,
    limit: number,
    offset: number,
  ): Promise<string[]> {
    if (type === 'posts') {
      const rows = await this.store.listPosts(limit, offset, query)
      return rows.map((r) => r.id)
    }
    const rows = await this.store.listReports(limit, offset, query)
    return rows.map((r) => r.id)
  }
}
