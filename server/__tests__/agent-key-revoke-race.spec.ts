// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SqliteStore } from '../store/sqlite-store.js'

/*
 * Race-condition guard for the agent API.
 *
 * The /api/agents/report route checks key.status === 'active' BEFORE
 * calling store.insertAgentReport. But between those two reads an admin
 * could revoke the key — the route's authorization decision would be
 * stale by the time the insert lands. Without an in-transaction
 * re-check, a revoked key could slip in one final report (and bump
 * usage_count) before the revoke takes effect.
 *
 * SqliteStore.insertAgentReport opens a transaction and re-reads the
 * key status before the row insert. This spec exercises the negative
 * path directly against the store: insert with a revoked key MUST
 * throw, and MUST NOT leave a report row, MUST NOT increment usage_count.
 *
 * This race is invisible at the route layer — by the time the test
 * could revoke between auth and insert, the timing is too tight to
 * deterministically reproduce. So we test the store contract directly.
 * The MysqlStore mirror uses `SELECT ... FOR UPDATE`; the same contract
 * applies and is locked by the parity tests under TEST_MYSQL_URL.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-key-revoke-race-'))
let store: SqliteStore

beforeAll(() => {
  store = new SqliteStore(join(tmpDir, 'test.db'))
})

afterAll(async () => {
  await store.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

const newReport = () => ({
  reporterFirstName: null,
  reporterCity: null,
  reporterCountry: null,
  reportedFirstName: 'Race',
  reportedCity: 'Paris',
  reportedCountry: 'FR',
  text: 'race condition probe',
  actionDate: null,
  severity: null,
  selfReportedModel: null,
  clientIpHash: null,
  source: 'api' as const,
})

describe('SqliteStore.insertAgentReport — in-transaction key revoke check', () => {
  it('rejects an insert against a revoked key with no side effects', async () => {
    // Seed an active key, then revoke it, then attempt insert. The
    // store's transactional re-check must abort.
    const seeded = await store.insertApiKey({
      keyHash: 'race-revoked-keyhash',
      keyLast4: 'last',
      emailHash: 'race-revoked-emailhash',
      status: 'active',
    })
    await store.revokeApiKey(seeded.id)
    const beforeUsage = (await store.getApiKeyByHash('race-revoked-keyhash'))?.usageCount ?? 0
    const beforeReports = await store.listAgentReports(50, 0)
    const beforeCount = beforeReports.length

    await expect(store.insertAgentReport(newReport(), 'race-revoked-keyhash')).rejects.toThrow(/api key is not active/)

    // No partial commit: usage_count unchanged, no new report row.
    const afterKey = await store.getApiKeyByHash('race-revoked-keyhash')
    expect(afterKey?.usageCount).toBe(beforeUsage)
    const afterReports = await store.listAgentReports(50, 0)
    expect(afterReports.length).toBe(beforeCount)
  })

  it('rejects an insert against a missing key (deleted from agent_keys table)', async () => {
    // Edge case: the key got purged entirely while a request is in
    // flight (e.g. via an admin operation we don't currently expose
    // but might in future). The transactional re-check must still fail
    // closed — `keyRow === undefined` short-circuits to "not active".
    await expect(store.insertAgentReport(newReport(), 'never-existed-keyhash')).rejects.toThrow(/api key is not active/)

    // No row landed in the reports table for this fictional key.
    const reports = await store.listAgentReports(50, 0)
    expect(reports.every((r) => r.text !== 'race condition probe')).toBe(true)
  })

  it('a successful insert against a still-active key bumps usage_count by exactly 1', async () => {
    // Counterpart positive: locks that the txn DOES commit usage when
    // the key is active. Without this, a regression that always
    // skipped the bump would leave the audit trail (usage_count) out
    // of sync — admin's "this key has been used N times" view would
    // under-report.
    const seeded = await store.insertApiKey({
      keyHash: 'race-active-keyhash',
      keyLast4: 'live',
      emailHash: 'race-active-emailhash',
      status: 'active',
    })
    const before = (await store.getApiKey(seeded.id))?.usageCount ?? 0
    await store.insertAgentReport(newReport(), 'race-active-keyhash')
    const after = (await store.getApiKey(seeded.id))?.usageCount ?? 0
    expect(after - before).toBe(1)
  })
})
