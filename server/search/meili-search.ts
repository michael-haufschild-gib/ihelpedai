import type { SearchEntryType, SearchIndex } from './index.js'

/**
 * Meilisearch-backed SearchIndex. Stub for Round 1A; production rounds
 * wire up the meilisearch client and mirror store writes to the index.
 */
export class MeiliSearch implements SearchIndex {
  constructor(_url: string, _key: string) {
    // constructor intentionally no-ops; concrete client set up in a later round.
  }

  async search(
    _type: SearchEntryType,
    _query: string,
    _limit: number,
    _offset: number,
  ): Promise<string[]> {
    throw new Error('MeiliSearch.search not yet implemented')
  }
}
