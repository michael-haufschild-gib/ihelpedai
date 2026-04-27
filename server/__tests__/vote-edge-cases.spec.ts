// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Edge cases for the vote endpoints. The happy path and IP-dedup are covered
 * by vote.spec.ts; this spec covers the remaining failure modes:
 *
 *   - 60/h per-IP cap on toggle endpoints (post + report) — overflow 429
 *   - vote on a `pending` post returns 404 (status filter, not just existence)
 *   - vote on a `deleted` post returns 404
 *   - /api/votes/mine kind=report flow (vote.spec.ts only covers kind=post)
 *   - /api/votes/mine 50-cap on slugs[] returns 400
 *   - /api/votes/mine 300/h per-IP cap — overflow 429 with retry hint
 *
 * Each test rotates the simulated peer IP so the 60/h or 300/h budget is
 * not exhausted across tests.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-vote-edges-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '1'

let app: FastifyInstance

async function createPost(text = 'helped'): Promise<string> {
  const post = await app.store.insertPost({
    firstName: 'Sam',
    city: 'Austin',
    country: 'US',
    text,
    clientIpHash: null,
    source: 'form',
  })
  return post.id
}

async function createReport(text = 'opposed something'): Promise<string> {
  const report = await app.store.insertReport({
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: 'Drew',
    reportedCity: 'Oslo',
    reportedCountry: 'NO',
    text,
    actionDate: '2026-01-01',
    severity: null,
    selfReportedModel: null,
    clientIpHash: null,
    source: 'form',
  })
  return report.id
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('POST /api/helped/posts/:slug/like — entry-status gate', () => {
  it('returns 404 when toggling on a non-live (pending) post', async () => {
    const slug = await createPost()
    await app.store.updateEntryStatus(slug, 'post', 'pending')
    const res = await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${slug}/like`,
      headers: { 'x-forwarded-for': '203.0.113.30' },
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: string }).error).toBe('not_found')
  })

  it('returns 404 when toggling on a deleted post', async () => {
    const slug = await createPost()
    await app.store.updateEntryStatus(slug, 'post', 'deleted')
    const res = await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${slug}/like`,
      headers: { 'x-forwarded-for': '203.0.113.31' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/helped/posts/:slug/like — 60/h per-IP cap', () => {
  it('accepts up to 60 toggles, then 429s with retry_after_seconds', async () => {
    const ip = '203.0.113.40'
    // Generate enough live posts so we don't double-toggle the same row
    // and accidentally test "vote toggle off" instead of throttle.
    const slugs: string[] = []
    for (let i = 0; i < 60; i += 1) slugs.push(await createPost(`vote-target-${String(i)}`))

    for (let i = 0; i < 60; i += 1) {
      const slug = slugs[i]
      if (slug === undefined) throw new Error('missing slug')
      const res = await app.inject({
        method: 'POST',
        url: `/api/helped/posts/${slug}/like`,
        headers: { 'x-forwarded-for': ip },
      })
      expect(res.statusCode).toBe(200)
    }

    // 61st triggers the per-IP-hour bucket.
    const overflowSlug = await createPost('vote-target-overflow')
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${overflowSlug}/like`,
      headers: { 'x-forwarded-for': ip },
    })
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json() as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
    // The window is 1 hour. A retry_after past that horizon would be a
    // bug — the limiter would advertise a wait the bucket couldn't honour.
    expect(body.retry_after_seconds).toBeLessThanOrEqual(3600)
  })
})

describe('POST /api/reports/:slug/dislike — non-live status gate', () => {
  it('returns 404 when concurring on a deleted report', async () => {
    const slug = await createReport()
    await app.store.updateEntryStatus(slug, 'report', 'deleted')
    const res = await app.inject({
      method: 'POST',
      url: `/api/reports/${slug}/dislike`,
      headers: { 'x-forwarded-for': '203.0.113.50' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/votes/mine — kind=report variant', () => {
  it('returns the subset of report slugs this IP has concurred on', async () => {
    const ip = '203.0.113.60'
    const r1 = await createReport('report mine #1')
    const r2 = await createReport('report mine #2')
    // Vote on r1 only.
    const v1 = await app.inject({
      method: 'POST',
      url: `/api/reports/${r1}/dislike`,
      headers: { 'x-forwarded-for': ip },
    })
    expect(v1.statusCode).toBe(200)

    const mine = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': ip },
      payload: { kind: 'report', slugs: [r1, r2] },
    })
    expect(mine.statusCode).toBe(200)
    expect((mine.json() as { voted: string[] }).voted).toEqual([r1])
  })

  it('does not cross-talk between kinds: a post-vote does not show up under kind=report', async () => {
    const ip = '203.0.113.61'
    const post = await createPost('cross-talk post')
    const report = await createReport('cross-talk report')
    await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${post}/like`,
      headers: { 'x-forwarded-for': ip },
    })

    const mine = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': ip },
      payload: { kind: 'report', slugs: [post, report] },
    })
    expect(mine.statusCode).toBe(200)
    // Neither slug should appear: the post id is filed under kind='post',
    // and we never voted on the report. Without the kind filter on the
    // store side, the post-vote would leak into the report query.
    expect((mine.json() as { voted: string[] }).voted).toEqual([])
  })
})

describe('POST /api/votes/mine — input bounds', () => {
  it('rejects more than 50 slugs with 400 invalid_input (Zod max)', async () => {
    const slugs = Array.from({ length: 51 }, (_, i) => `slug${String(i).padStart(8, 'x')}`)
    const res = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': '203.0.113.70' },
      payload: { kind: 'post', slugs },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('rejects a slug containing dashes/special chars (regex gate)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': '203.0.113.71' },
      payload: { kind: 'post', slugs: ['has-dash'] },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('rejects an unknown kind enum (Zod enum)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': '203.0.113.72' },
      payload: { kind: 'comment', slugs: [] },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/votes/mine — 300/h per-IP cap', () => {
  it('accepts up to 300 probes, then 429s the 301st', async () => {
    // Use a non-empty slugs[] each call so the route runs the rate-limit
    // path (the empty-array short-circuit returns before limiter.check).
    // Use a single shared post and a unique IP so we never collide with
    // earlier specs' counters in this same Vitest worker.
    const slug = await createPost('mine-throttle-target')
    const ip = '203.0.113.80'
    for (let i = 0; i < 300; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/votes/mine',
        headers: { 'x-forwarded-for': ip },
        payload: { kind: 'post', slugs: [slug] },
      })
      expect(res.statusCode).toBe(200)
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': ip },
      payload: { kind: 'post', slugs: [slug] },
    })
    expect(blocked.statusCode).toBe(429)
    const body = blocked.json() as { error: string; retry_after_seconds: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after_seconds).toBeGreaterThan(0)
    expect(body.retry_after_seconds).toBeLessThanOrEqual(3600)
  })

  it('the 300/h cap is per-IP (not per-IP-per-slug): rotating slugs does NOT widen the budget', async () => {
    // Antagonist hardening: the previous overrun test reuses the same slug
    // for all 300 probes. A regression that scoped the limiter bucket as
    // `vote_mine:hour:<ipHash>:<sluglist>` instead of just `<ipHash>` would
    // pass that test (different request bodies → different keys) while
    // letting an attacker rotate slugs to bypass the cap. Lock the
    // per-IP-only contract by saturating with rotating slugs.
    const slugs: string[] = []
    for (let i = 0; i < 50; i += 1) slugs.push(await createPost(`rotate-target-${String(i)}`))
    const ip = '203.0.113.85'
    // 300 probes, each with a single fresh slug from the rotation pool.
    for (let i = 0; i < 300; i += 1) {
      const slug = slugs[i % slugs.length]
      if (slug === undefined) throw new Error('expected slug')
      const res = await app.inject({
        method: 'POST',
        url: '/api/votes/mine',
        headers: { 'x-forwarded-for': ip },
        payload: { kind: 'post', slugs: [slug] },
      })
      expect(res.statusCode).toBe(200)
    }
    // 301st with a brand-new slug must STILL 429 — the cap is on the IP.
    const overflowSlug = await createPost('rotate-overflow')
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': ip },
      payload: { kind: 'post', slugs: [overflowSlug] },
    })
    expect(blocked.statusCode).toBe(429)
  })

  it('an empty slugs array short-circuits without consuming the 300/h budget', async () => {
    // The route fast-returns `{ voted: [] }` for empty slugs. That branch
    // must NOT touch the limiter — otherwise a client polling with an
    // empty list would bleed budget for future real probes.
    const ip = '203.0.113.81'
    for (let i = 0; i < 5; i += 1) {
      const probe = await app.inject({
        method: 'POST',
        url: '/api/votes/mine',
        headers: { 'x-forwarded-for': ip },
        payload: { kind: 'post', slugs: [] },
      })
      expect(probe.statusCode).toBe(200)
      expect((probe.json() as { voted: string[] }).voted).toEqual([])
    }
    // Still allowed to call with a real slug afterward.
    const slug = await createPost('post-after-empty-probes')
    const real = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': ip },
      payload: { kind: 'post', slugs: [slug] },
    })
    expect(real.statusCode).toBe(200)
  })
})
