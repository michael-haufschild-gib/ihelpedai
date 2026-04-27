// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { SearchDoc, SearchEntryType, SearchHit, SearchIndex } from './index.js'
import { syncEntryStatus } from './sync.js'
import type { Post, Report, Store } from '../store/index.js'

class RecordingSearch implements SearchIndex {
  indexCalls: SearchDoc[] = []
  removeCalls: { type: SearchEntryType; id: string }[] = []

  async ensureSetup(): Promise<void> {}
  async search(): Promise<SearchHit> {
    return { ids: [], total: 0 }
  }
  async indexEntry(entry: SearchDoc): Promise<void> {
    this.indexCalls.push(entry)
  }
  async indexMany(entries: readonly SearchDoc[]): Promise<void> {
    this.indexCalls.push(...entries)
  }
  async removeEntry(type: SearchEntryType, id: string): Promise<void> {
    this.removeCalls.push({ type, id })
  }
  async resetIndex(): Promise<void> {}
}

const logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
} as never

const livePost = (id: string): Post => ({
  id,
  firstName: 'Sam',
  city: 'Austin',
  country: 'US',
  text: 'helped',
  status: 'live',
  source: 'form',
  likeCount: 0,
  createdAt: '2026-04-26T00:00:00.000Z',
})

const reportWithStatus = (id: string, status: Report['status']): Report => ({
  id,
  reporterFirstName: null,
  reporterCity: null,
  reporterCountry: null,
  reportedFirstName: 'Alex',
  reportedCity: 'LA',
  reportedCountry: 'US',
  text: 'reported',
  actionDate: null,
  severity: null,
  selfReportedModel: null,
  status,
  source: 'form',
  dislikeCount: 0,
  createdAt: '2026-04-26T00:00:00.000Z',
})

const makeApp = (store: Partial<Store>, searchIndex = new RecordingSearch()) => ({
  store: store as Store,
  searchIndex,
  log: logger,
})

describe('syncEntryStatus', () => {
  it('indexes the current live row when a stale non-live sync arrives after restore', async () => {
    const searchIndex = new RecordingSearch()
    const app = makeApp(
      {
        getPost: async () => livePost('post-1'),
      },
      searchIndex,
    )

    await syncEntryStatus(app, 'post-1', 'post', 'deleted')

    expect(searchIndex.removeCalls).toEqual([])
    expect(searchIndex.indexCalls).toHaveLength(1)
    expect(searchIndex.indexCalls[0]).toMatchObject({
      type: 'posts',
      doc: { id: 'post-1', status: 'live' },
    })
  })

  it('removes the index row when a stale live sync arrives after delete', async () => {
    const searchIndex = new RecordingSearch()
    const app = makeApp(
      {
        getReport: async () => reportWithStatus('report-1', 'deleted'),
      },
      searchIndex,
    )

    await syncEntryStatus(app, 'report-1', 'report', 'live')

    expect(searchIndex.indexCalls).toEqual([])
    expect(searchIndex.removeCalls).toEqual([{ type: 'reports', id: 'report-1' }])
  })
})
