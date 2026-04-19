import type { SearchEntryType, SearchIndex } from './index.js'

/**
 * Meilisearch-backed SearchIndex. Stub for Round 1A; production rounds
 * wire up the meilisearch client and mirror store writes to the index.
 * Constructor fails fast so `SEARCH=meili` cannot boot an unsupported build.
 */
export class MeiliSearch implements SearchIndex {
  constructor(_url: string, _key: string) {
    throw new Error(
      'SEARCH=meili is not yet implemented in this build. Use SEARCH=sql.',
    )
  }

  async search(
    _type: SearchEntryType,
    _query: string,
    _limit: number,
    _offset: number,
  ): Promise<string[]> {
    throw new Error('unreachable')
  }
}
