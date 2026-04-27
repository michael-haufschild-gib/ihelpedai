// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database as SqliteDatabase } from 'better-sqlite3'

import { SqliteStore } from '../store/sqlite-store.js'

/**
 * Locks the dev-vs-prod pagination contract: SqliteStore must produce
 * deterministic ordering when multiple rows share a created_at millisecond.
 * Without `id DESC` as a secondary sort key, repeated paginated requests
 * could return the same row twice or skip rows entirely. The MySQL store
 * already includes the tie-breaker; this spec keeps the SQLite side aligned.
 */
describe('SqliteStore pagination tie-breaker', () => {
  let store: SqliteStore
  let rawDb: SqliteDatabase

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ihelped-paginate-'))
    store = new SqliteStore(join(dir, 'test.db'))
    rawDb = (store as unknown as { db: SqliteDatabase }).db
  })

  afterEach(async () => {
    await store.close()
  })

  it('orders posts deterministically when created_at collides', async () => {
    // Insert several posts in the same transaction so they share the
    // millisecond timestamp produced by SQLite's strftime('now').
    const ids: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const row = await store.insertPost({
        firstName: `User${String(i)}`,
        city: 'Paris',
        country: 'FR',
        text: `entry ${String(i)}`,
        clientIpHash: null,
        source: 'form',
      })
      ids.push(row.id)
    }
    // Two consecutive paginations of the same query must return the same
    // ordering — that is the tie-breaker contract.
    const firstPage = await store.listPosts(5, 0, undefined)
    const secondPage = await store.listPosts(5, 0, undefined)
    expect(firstPage.map((r) => r.id)).toEqual(secondPage.map((r) => r.id))
    // And paginating in two windows of three + two must concatenate to the
    // same five ids without duplicates or skips.
    const window1 = await store.listPosts(3, 0, undefined)
    const window2 = await store.listPosts(3, 3, undefined)
    const concatenated = [...window1.map((r) => r.id), ...window2.map((r) => r.id)]
    expect(new Set(concatenated).size).toBe(5)
  })

  it('orders reports deterministically when created_at collides', async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.insertReport({
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: `Target${String(i)}`,
        reportedCity: 'Berlin',
        reportedCountry: 'DE',
        text: `report ${String(i)}`,
        actionDate: '2026-01-01',
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'form',
      })
    }
    const firstPage = await store.listReports(5, 0, undefined, 'all')
    const secondPage = await store.listReports(5, 0, undefined, 'all')
    expect(firstPage.map((r) => r.id)).toEqual(secondPage.map((r) => r.id))
  })

  it('orders admin entries deterministically when created_at collides', async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.insertPost({
        firstName: `Admin${String(i)}`,
        city: 'Paris',
        country: 'FR',
        text: `admin entry ${String(i)}`,
        clientIpHash: null,
        source: 'form',
      })
    }
    rawDb.prepare("UPDATE posts SET created_at = '2026-01-01T00:00:00.000Z'").run()
    const window1 = await store.listAdminEntries(3, 0, { entryType: 'post' })
    const window2 = await store.listAdminEntries(3, 3, { entryType: 'post' })
    const ids = [...window1, ...window2].map((entry) => entry.id)
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
  })

  it('orders audit, API-key, and takedown pages deterministically under timestamp ties', async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.insertAuditEntry(null, 'test_action', `target-${String(i)}`, 'test', null)
      await store.insertApiKey({
        keyHash: `key-${String(i)}`,
        keyLast4: `k-${String(i)}`,
        emailHash: `email-${String(i)}`,
        status: 'active',
      })
      await store.insertTakedown({
        requesterEmail: null,
        entryId: null,
        entryKind: null,
        reason: `reason ${String(i)}`,
        dateReceived: '2026-01-01T00:00:00.000Z',
      })
    }
    rawDb.prepare("UPDATE audit_log SET created_at = '2026-01-01T00:00:00.000Z'").run()
    rawDb.prepare("UPDATE agent_keys SET issued_at = '2026-01-01T00:00:00.000Z'").run()

    const auditIds = [
      ...(await store.listAuditLog(3, 0)).map((entry) => entry.id),
      ...(await store.listAuditLog(3, 3)).map((entry) => entry.id),
    ]
    const apiKeyIds = [
      ...(await store.listApiKeys(3, 0)).map((entry) => entry.id),
      ...(await store.listApiKeys(3, 3)).map((entry) => entry.id),
    ]
    const takedownIds = [
      ...(await store.listTakedowns(3, 0)).map((entry) => entry.id),
      ...(await store.listTakedowns(3, 3)).map((entry) => entry.id),
    ]

    expect(new Set(auditIds).size).toBe(5)
    expect(new Set(apiKeyIds).size).toBe(5)
    expect(new Set(takedownIds).size).toBe(5)
  })
})
