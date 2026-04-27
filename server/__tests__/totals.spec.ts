// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { totalsSchema, parseResponse } from '../../src/lib/wireSchemas.js'

/*
 * Behavioural lock for GET /api/totals. The endpoint exists to keep the
 * site footer from rendering em-dash placeholders on every page; the
 * locks below are:
 *
 *   - shape matches `totalsSchema` (drift fails CI alongside every other
 *     wire-schema-bound test);
 *   - counts increment with new live posts/reports (form + agent);
 *   - api-source agents are surfaced separately from form reports;
 *   - non-live entries (pending, deleted) do NOT contribute to any cell.
 *
 * Without the last invariant a soft-deleted post would still inflate
 * the footer's "good deeds" count, which is the bug the row-status
 * filter on `countFilteredEntries` already prevents — locking it here
 * means a refactor that drops the filter from the totals path fails
 * loud rather than silent.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-totals-'))
// Snapshot every env key the suite mutates so vitest workers stay isolated;
// without this, IP_HASH_SALT/DEV_RATE_MULTIPLIER would bleed into sibling
// specs that import `config.ts` and pin env-dependent state at module load.
const previousEnv = {
  SQLITE_PATH: process.env.SQLITE_PATH,
  NODE_ENV: process.env.NODE_ENV,
  IP_HASH_SALT: process.env.IP_HASH_SALT,
  DEV_RATE_MULTIPLIER: process.env.DEV_RATE_MULTIPLIER,
} as const
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

let app: FastifyInstance | undefined

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  try {
    // Guard close so a setup failure (where `app` was never assigned)
    // doesn't mask the real beforeAll error with a TypeError.
    await app?.close()
    rmSync(tmpDir, { recursive: true, force: true })
  } finally {
    // Env restoration must run even if close()/rmSync threw — otherwise
    // a teardown failure here leaks mutated SQLITE_PATH/IP_HASH_SALT/etc.
    // into sibling specs in the same vitest worker.
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

function getApp(): FastifyInstance {
  if (app === undefined) throw new Error('app not initialized')
  return app
}

describe('GET /api/totals', () => {
  it('returns zeros against an empty store and matches the wire schema', async () => {
    const res = await getApp().inject({ method: 'GET', url: '/api/totals' })
    expect(res.statusCode).toBe(200)
    const body = parseResponse('GET /api/totals', totalsSchema, res.json())
    expect(body).toEqual({ posts: 0, reports: 0, agents: 0 })
  })

  it('counts live posts and form-source live reports separately from api-source agent reports', async () => {
    await getApp().store.insertPost({
      firstName: 'Totals',
      city: 'Austin',
      country: 'US',
      text: 'totals probe post',
      clientIpHash: null,
      source: 'form',
    })
    await getApp().store.insertReport({
      reporterFirstName: null,
      reporterCity: null,
      reporterCountry: null,
      reportedFirstName: 'TotalsForm',
      reportedCity: 'Oslo',
      reportedCountry: 'NO',
      text: 'totals probe form report',
      actionDate: null,
      severity: null,
      selfReportedModel: null,
      clientIpHash: null,
      source: 'form',
    })
    await getApp().store.insertApiKey({
      keyHash: 'totals-keyhash',
      keyLast4: 'totl',
      emailHash: 'totals-email',
      status: 'active',
    })
    await getApp().store.insertAgentReport(
      {
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: 'TotalsAgent',
        reportedCity: 'Paris',
        reportedCountry: 'FR',
        text: 'totals probe agent report',
        actionDate: null,
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'api',
      },
      'totals-keyhash',
      'live',
    )
    const res = await getApp().inject({ method: 'GET', url: '/api/totals' })
    expect(res.statusCode).toBe(200)
    const body = parseResponse('GET /api/totals', totalsSchema, res.json())
    // posts: 1 (form post seeded above)
    // reports: 2 (one form + one api — countFilteredEntries on `reports`
    //             without a `source` filter aggregates both because the
    //             footer cares about the whole reports table; agents is
    //             the api-only subset)
    // agents: 1 (the live api-source report seeded above)
    expect(body.posts).toBe(1)
    expect(body.reports).toBe(2)
    expect(body.agents).toBe(1)
  })

  it('ignores pending and deleted rows so soft-deletes do not inflate the strip', async () => {
    // Both a deleted post and a pending post must leave the totals
    // unchanged. The suite lock-text claims pending coverage; assert it
    // here so a regression that drops the pending filter from the totals
    // path fails loud rather than silent.
    const before = parseResponse(
      'GET /api/totals',
      totalsSchema,
      (await getApp().inject({ method: 'GET', url: '/api/totals' })).json(),
    )
    const ghost = await getApp().store.insertPost({
      firstName: 'Ghost',
      city: 'Limbo',
      country: 'US',
      text: 'shall not count',
      clientIpHash: null,
      source: 'form',
    })
    await getApp().store.updateEntryStatus(ghost.id, 'post', 'deleted')
    const pending = await getApp().store.insertPost({
      firstName: 'Soon',
      city: 'Queue',
      country: 'US',
      text: 'not yet live',
      clientIpHash: null,
      source: 'form',
    })
    await getApp().store.updateEntryStatus(pending.id, 'post', 'pending')
    const after = parseResponse(
      'GET /api/totals',
      totalsSchema,
      (await getApp().inject({ method: 'GET', url: '/api/totals' })).json(),
    )
    expect(after.posts).toBe(before.posts)
    expect(after.reports).toBe(before.reports)
    expect(after.agents).toBe(before.agents)
  })
})
