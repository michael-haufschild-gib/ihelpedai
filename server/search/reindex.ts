import { config } from '../config.js'
import type { Store } from '../store/index.js'
import { MysqlStore } from '../store/mysql-store.js'
import { SqliteStore } from '../store/sqlite-store.js'

import type { SearchIndex } from './index.js'
import { MeiliSearch } from './meili-search.js'
import { SqlSearch } from './sql-search.js'
import { postToDoc, reportToDoc } from './sync.js'

const BATCH = 500

function buildStore(): Store {
  if (config.STORE === 'mysql') {
    if (config.MYSQL_URL === undefined || config.MYSQL_URL === '') {
      throw new Error('STORE=mysql requires MYSQL_URL')
    }
    return new MysqlStore(config.MYSQL_URL)
  }
  return new SqliteStore(config.SQLITE_PATH)
}

function buildSearch(store: Store): SearchIndex {
  if (config.SEARCH !== 'meili') {
    return new SqlSearch(store)
  }
  if (config.MEILI_URL === undefined || config.MEILI_URL === '') {
    throw new Error('SEARCH=meili requires MEILI_URL')
  }
  if (config.MEILI_KEY === undefined || config.MEILI_KEY === '') {
    throw new Error('SEARCH=meili requires MEILI_KEY')
  }
  return new MeiliSearch(config.MEILI_URL, config.MEILI_KEY)
}

/**
 * Rebuild the search index from the persistent store. Enumerates every live
 * post and report, upserts each into the search index in batches. Safe to
 * run against an empty index (initial backfill) or an existing one (fills
 * gaps caused by drift between writes and index acks).
 */
async function main(): Promise<void> {
  const store = buildStore()
  const search = buildSearch(store)

  if (search instanceof SqlSearch) {
    process.stderr.write('SEARCH is not meili; nothing to reindex.\n')
    await store.close()
    return
  }

  await search.ensureSetup()

  // Clear each index before backfilling. Without this, any previously-indexed
  // doc whose remove hook was dropped survives the rebuild and keeps drifting
  // totalHits / pagination, defeating the point of a reindex. Run in parallel
  // since the two indexes are independent tasks inside Meili.
  await Promise.all([search.resetIndex('posts'), search.resetIndex('reports')])

  let posted = 0
  let offset = 0
  while (true) {
    const batch = await store.listPosts(BATCH, offset, undefined)
    if (batch.length === 0) break
    // One bulk index call per batch instead of one per row. 500 docs × 2
    // Meili round-trips each → 2 round-trips total; wall-clock drops by
    // roughly the factor of BATCH on network-bound reindexes.
    await search.indexMany(batch.map((post) => ({ type: 'posts', doc: postToDoc(post) })))
    posted += batch.length
    process.stdout.write(`posts: ${String(posted)}\n`)
    offset += BATCH
    if (batch.length < BATCH) break
  }
  process.stdout.write(`indexed ${String(posted)} posts\n`)

  let reported = 0
  offset = 0
  while (true) {
    const batch = await store.listReports(BATCH, offset, undefined, 'all')
    if (batch.length === 0) break
    await search.indexMany(batch.map((report) => ({ type: 'reports', doc: reportToDoc(report) })))
    reported += batch.length
    process.stdout.write(`reports: ${String(reported)}\n`)
    offset += BATCH
    if (batch.length < BATCH) break
  }
  process.stdout.write(`indexed ${String(reported)} reports\n`)

  await store.close()
}

main().catch((err: unknown) => {
  process.stderr.write(`reindex failed: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
