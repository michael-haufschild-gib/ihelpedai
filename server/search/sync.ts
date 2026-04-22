import type { FastifyInstance, FastifyBaseLogger } from 'fastify'

import type { EntryStatus, Post, Report, Store } from '../store/index.js'

import type { PostSearchDoc, ReportSearchDoc, SearchIndex } from './index.js'

/** Build the search doc for a post. */
export function postToDoc(post: Post): PostSearchDoc {
  return {
    id: post.id,
    first_name: post.firstName,
    city: post.city,
    country: post.country,
    text: post.text,
    status: post.status,
    source: post.source,
    created_at: post.createdAt,
  }
}

/** Build the search doc for a report. */
export function reportToDoc(report: Report): ReportSearchDoc {
  return {
    id: report.id,
    reported_first_name: report.reportedFirstName,
    reported_city: report.reportedCity,
    reported_country: report.reportedCountry,
    reporter_first_name: report.reporterFirstName,
    text: report.text,
    status: report.status,
    source: report.source,
    created_at: report.createdAt,
  }
}

/**
 * Sync the search index after a status transition. Upserts when the entry
 * is live, deletes when it has moved to pending/deleted or been purged.
 * Fire-and-forget at the caller boundary: the returned promise is rejected
 * only by network/index errors, never logged exceptions propagated.
 */
export async function syncEntryStatus(
  app: Pick<FastifyInstance, 'searchIndex' | 'store' | 'log'>,
  id: string,
  entryType: 'post' | 'report',
  newStatus: EntryStatus | 'purged',
): Promise<void> {
  const type = entryType === 'post' ? 'posts' : 'reports'
  if (newStatus !== 'live') {
    await app.searchIndex.removeEntry(type, id)
    return
  }
  if (entryType === 'post') {
    const fresh = await app.store.getPost(id)
    if (fresh === null) return
    await app.searchIndex.indexEntry({ type: 'posts', doc: postToDoc(fresh) })
  } else {
    const fresh = await app.store.getReport(id)
    if (fresh === null) return
    await app.searchIndex.indexEntry({ type: 'reports', doc: reportToDoc(fresh) })
  }
}

/**
 * Fire-and-forget wrapper around syncEntryStatus. Admin routes should call
 * this directly so a search outage never blocks the status update.
 */
export function syncEntryStatusAsync(
  app: Pick<FastifyInstance, 'searchIndex' | 'store' | 'log'>,
  log: FastifyBaseLogger,
  id: string,
  entryType: 'post' | 'report',
  newStatus: EntryStatus | 'purged',
): void {
  syncEntryStatus(app, id, entryType, newStatus).catch((err: unknown) => {
    log.error({ err, op: 'search_index', id, entryType, newStatus }, 'search_sync_failed')
  })
}

export type { Store, SearchIndex }
