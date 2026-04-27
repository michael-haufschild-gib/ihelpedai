// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockSearchResponse {
  hits: Array<{ id: unknown }>
  totalHits: number
}

const state = vi.hoisted(() => ({
  createIndexCalls: [] as Array<{ uid: string; options: unknown }>,
  updateSettingsCalls: [] as Array<{ uid: string; settings: unknown }>,
  searchCalls: [] as Array<{ uid: string; query: string; options: unknown }>,
  searchResponse: { hits: [], totalHits: 0 } as MockSearchResponse,
}))

vi.mock('meilisearch', () => {
  class FakeIndex {
    constructor(private readonly uid: string) {}

    updateSettings(settings: unknown): { waitTask: () => Promise<void> } {
      state.updateSettingsCalls.push({ uid: this.uid, settings })
      return { waitTask: async () => undefined }
    }

    async search(query: string, options: unknown): Promise<MockSearchResponse> {
      state.searchCalls.push({ uid: this.uid, query, options })
      return state.searchResponse
    }

    addDocuments(): { waitTask: () => Promise<void> } {
      return { waitTask: async () => undefined }
    }

    deleteDocument(): { waitTask: () => Promise<void> } {
      return { waitTask: async () => undefined }
    }

    deleteAllDocuments(): { waitTask: () => Promise<void> } {
      return { waitTask: async () => undefined }
    }
  }

  class FakeMeiliClient {
    constructor(_opts: unknown) {}

    createIndex(uid: string, options: unknown): { waitTask: () => Promise<void> } {
      state.createIndexCalls.push({ uid, options })
      return { waitTask: async () => undefined }
    }

    index(uid: string): FakeIndex {
      return new FakeIndex(uid)
    }
  }

  return { MeiliSearch: FakeMeiliClient }
})

import { MeiliSearch } from './meili-search.js'

describe('MeiliSearch adapter', () => {
  beforeEach(() => {
    state.createIndexCalls = []
    state.updateSettingsCalls = []
    state.searchCalls = []
    state.searchResponse = { hits: [], totalHits: 0 }
  })

  it('configures the id tie-breaker as sortable for deterministic pagination', async () => {
    const search = new MeiliSearch('http://meili.test', 'secret')

    await search.ensureSetup()

    expect(state.updateSettingsCalls).toEqual([
      {
        uid: 'ihelpedai_posts',
        settings: {
          searchableAttributes: ['first_name', 'city', 'country', 'text'],
          filterableAttributes: ['status', 'source'],
          sortableAttributes: ['created_at', 'id'],
        },
      },
      {
        uid: 'ihelpedai_reports',
        settings: {
          searchableAttributes: [
            'reported_first_name',
            'reported_city',
            'reported_country',
            'reporter_first_name',
            'text',
          ],
          filterableAttributes: ['status', 'source'],
          sortableAttributes: ['created_at', 'id'],
        },
      },
    ])
  })

  it('searches with the same deterministic ordering as SQL fallback', async () => {
    state.searchResponse = {
      hits: [{ id: 'post-b' }, { id: 'post-a' }, { id: 42 }],
      totalHits: 2,
    }
    const search = new MeiliSearch('http://meili.test', 'secret')

    const result = await search.search('posts', 'same millisecond', 20, 3)

    expect(result).toEqual({ ids: ['post-b', 'post-a'], total: 2 })
    expect(state.searchCalls).toEqual([
      {
        uid: 'ihelpedai_posts',
        query: 'same millisecond',
        options: {
          page: 3,
          hitsPerPage: 20,
          filter: 'status = "live"',
          sort: ['created_at:desc', 'id:desc'],
          attributesToRetrieve: ['id'],
        },
      },
    ])
  })
})
