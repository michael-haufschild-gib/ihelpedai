import { MeiliSearch as MeiliClient } from 'meilisearch'
import type { Index } from 'meilisearch'

import type {
  PostSearchDoc,
  ReportSearchDoc,
  SearchDoc,
  SearchEntryType,
  SearchHit,
  SearchIndex,
} from './index.js'

const POSTS_INDEX = 'ihelpedai_posts'
const REPORTS_INDEX = 'ihelpedai_reports'

const POSTS_SEARCHABLE = ['first_name', 'city', 'country', 'text']
const REPORTS_SEARCHABLE = [
  'reported_first_name',
  'reported_city',
  'reported_country',
  'reporter_first_name',
  'text',
]

type IndexUid = typeof POSTS_INDEX | typeof REPORTS_INDEX

const uidFor = (type: SearchEntryType): IndexUid =>
  type === 'posts' ? POSTS_INDEX : REPORTS_INDEX

/** Narrow unknown errors to the shape Meilisearch throws. */
function isAlreadyExistsError(err: unknown): boolean {
  const e = err as { code?: unknown } | null
  return e?.code === 'index_already_exists'
}

/**
 * Meilisearch-backed SearchIndex. Indexes are namespaced with `ihelpedai_`
 * so the shared Meili host can host other projects without collision.
 * Only rows with status = 'live' are indexed; the route layer is responsible
 * for deleting docs on status transitions away from live.
 */
export class MeiliSearch implements SearchIndex {
  private readonly client: MeiliClient

  constructor(url: string, apiKey: string) {
    this.client = new MeiliClient({ host: url, apiKey })
  }

  async ensureSetup(): Promise<void> {
    await this.ensureIndex(POSTS_INDEX, POSTS_SEARCHABLE)
    await this.ensureIndex(REPORTS_INDEX, REPORTS_SEARCHABLE)
  }

  private async ensureIndex(uid: IndexUid, searchable: readonly string[]): Promise<void> {
    // `createIndex` / `updateSettings` return an EnqueuedTaskPromise that
    // resolves when the task is *enqueued*, not completed. `.waitTask()` on
    // the returned promise blocks until the task finishes, so a fresh boot
    // never starts serving queries before the index/settings exist.
    try {
      await this.client.createIndex(uid, { primaryKey: 'id' }).waitTask()
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
    const index = this.client.index(uid)
    await index.updateSettings({
      searchableAttributes: [...searchable],
      filterableAttributes: ['status', 'source'],
      sortableAttributes: ['created_at'],
    }).waitTask()
  }

  async search(
    type: SearchEntryType,
    query: string,
    hitsPerPage: number,
    page: number,
  ): Promise<SearchHit> {
    const index: Index<PostSearchDoc | ReportSearchDoc> = this.client.index(uidFor(type))
    const response = await index.search(query, {
      page,
      hitsPerPage,
      filter: 'status = "live"',
      sort: ['created_at:desc'],
      attributesToRetrieve: ['id'],
    })
    const ids = response.hits
      .map((h) => (typeof h.id === 'string' ? h.id : null))
      .filter((id): id is string => id !== null)
    return { ids, total: response.totalHits }
  }

  async indexEntry(entry: SearchDoc): Promise<void> {
    // Wait for the enqueued task so the reindex script — which awaits this
    // method in its backfill loop — doesn't exit before Meili has actually
    // processed the document.
    const index = this.client.index(uidFor(entry.type))
    await index
      .addDocuments([entry.doc as PostSearchDoc | ReportSearchDoc], { primaryKey: 'id' })
      .waitTask()
  }

  async removeEntry(type: SearchEntryType, id: string): Promise<void> {
    const index = this.client.index(uidFor(type))
    await index.deleteDocument(id).waitTask()
  }

  async resetIndex(type: SearchEntryType): Promise<void> {
    const index = this.client.index(uidFor(type))
    await index.deleteAllDocuments().waitTask()
  }
}
