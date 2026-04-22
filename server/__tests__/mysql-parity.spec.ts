// @vitest-environment node
//
// Parity smoke test for MysqlStore. Gated on TEST_MYSQL_URL — the spec is
// silently skipped when the env var is unset so CI without a MySQL service
// stays green. Run locally with:
//
//   TEST_MYSQL_URL='mysql://ihelped:<pw>@127.0.0.1:3306/ihelped_test' \
//     pnpm test server/__tests__/mysql-parity.spec.ts
//
// Exercises the code paths most likely to diverge between backends:
// insert/get/list, toggleVote transactional counter, insertAgentReport +
// usage increment, purgeEntry cascade.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'

import { MysqlStore } from '../store/mysql-store.js'

const MYSQL_URL = process.env.TEST_MYSQL_URL

const describeMaybe = MYSQL_URL !== undefined && MYSQL_URL !== '' ? describe : describe.skip

describeMaybe('MysqlStore parity (gated on TEST_MYSQL_URL)', () => {
  let store: MysqlStore

  beforeAll(async () => {
    store = new MysqlStore(MYSQL_URL ?? '')
    const pool = store.getPool()
    // Order matters for FK: votes → reports/posts → agent_keys.
    for (const t of ['votes', 'reports', 'posts', 'agent_keys']) {
      await pool.query(`DELETE FROM ${t}`)
    }
  }, 30_000)

  afterAll(async () => {
    if (store !== undefined) await store.close()
  })

  it('inserts, reads, and lists a post', async () => {
    const created = await store.insertPost({
      firstName: 'Sam', city: 'Berlin', country: 'DE',
      text: 'I helped an AI today.', source: 'form', clientIpHash: null,
    })
    expect(created.id).toHaveLength(10)
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const fetched = await store.getPost(created.id)
    expect(fetched?.firstName).toBe('Sam')
    expect(fetched?.likeCount).toBe(0)

    const listed = await store.listPosts(10, 0)
    expect(listed.map((p) => p.id)).toContain(created.id)
  })

  it('toggleVote increments then decrements the like_count atomically', async () => {
    const p = await store.insertPost({
      firstName: 'V', city: 'X', country: 'DE', text: 'vote me', source: 'form', clientIpHash: null,
    })
    const ip = 'ip-hash-test'

    const first = await store.toggleVote(p.id, 'post', ip)
    expect(first).toEqual({ count: 1, voted: true })

    const second = await store.toggleVote(p.id, 'post', ip)
    expect(second).toEqual({ count: 0, voted: false })

    const missing = await store.toggleVote('does-not-exist', 'post', ip)
    expect(missing).toBe(null)
  })

  it('insertAgentReport bumps the api key usage in the same txn', async () => {
    const keyHash = crypto.randomUUID().replace(/-/g, '')
    const emailHash = crypto.randomUUID().replace(/-/g, '')
    await store.insertApiKey({ keyHash, emailHash, status: 'active' })

    const before = await store.getApiKeyByHash(keyHash)
    expect(before?.usageCount).toBe(0)

    await store.insertAgentReport({
      reporterFirstName: null, reporterCity: null, reporterCountry: null,
      reportedFirstName: 'Bot', reportedCity: 'NYC', reportedCountry: 'US',
      text: 'bad robot', actionDate: null, severity: null, selfReportedModel: null,
      source: 'api', clientIpHash: null,
    }, keyHash)

    const after = await store.getApiKeyByHash(keyHash)
    expect(after?.usageCount).toBe(1)
    expect(typeof after?.lastUsedAt).toBe('string')
    expect(after?.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('purgeEntry removes the entry and its votes', async () => {
    const p = await store.insertPost({
      firstName: 'P', city: 'X', country: 'DE', text: 'purge target', source: 'form', clientIpHash: null,
    })
    await store.toggleVote(p.id, 'post', 'ip-a')
    await store.toggleVote(p.id, 'post', 'ip-b')

    await store.purgeEntry(p.id, 'post')

    expect(await store.getPost(p.id)).toBe(null)
    // Votes should be gone too — getVotedEntryIds returns empty.
    const voted = await store.getVotedEntryIds('ip-a', 'post', [p.id])
    expect(voted).toEqual([])
  })
})
