/** Searchable entry type. */
export type SearchEntryType = 'posts' | 'reports'

/**
 * Search abstraction. Returns the IDs of matching entries; the caller is
 * expected to hydrate full rows from the Store. Dev impl delegates to
 * Store.listPosts / listReports with a LIKE query. Prod impl mirrors
 * writes to Meilisearch and reads from it.
 */
export interface SearchIndex {
  search(
    type: SearchEntryType,
    query: string,
    limit: number,
    offset: number,
  ): Promise<string[]>
}
