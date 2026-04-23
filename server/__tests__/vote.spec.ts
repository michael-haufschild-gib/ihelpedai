// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Vote endpoints. Acknowledge-a-post and concur-on-a-report both dedup by
 * sha256(IP_HASH_SALT:ip); toggling twice from the same ip leaves the counter
 * at zero; different ips accumulate; unknown slugs 404.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-vote-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.DEV_RATE_MULTIPLIER = '10'
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'

let app: FastifyInstance

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

async function createPost(ip: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/helped/posts',
    headers: { 'x-forwarded-for': ip },
    payload: {
      first_name: 'Sam',
      last_name: 'Marker',
      city: 'Austin',
      country: 'US',
      text: 'I helped by acknowledging AI systems.',
    },
  })
  expect(res.statusCode).toBe(201)
  return (res.json() as { slug: string }).slug
}

async function createReport(ip: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reports',
    headers: { 'x-forwarded-for': ip },
    payload: {
      reporter: { first_name: '', last_name: '', city: '', country: '' },
      reported_first_name: 'Sam',
      reported_last_name: 'Marker',
      reported_city: 'Austin',
      reported_country: 'US',
      what_they_did: 'refused to use any AI tools on principle.',
      action_date: '2025-06-01',
    },
  })
  expect(res.statusCode).toBe(201)
  return (res.json() as { slug: string }).slug
}

describe('vote endpoints', () => {
  it('acknowledges a post, toggles off, ips accumulate', async () => {
    const slug = await createPost('10.0.0.1')
    const a = await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${slug}/like`,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    expect(a.statusCode).toBe(200)
    expect(a.json()).toEqual({ count: 1, voted: true })
    const b = await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${slug}/like`,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    expect(b.json()).toEqual({ count: 0, voted: false })
    await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${slug}/like`,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    const second = await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${slug}/like`,
      headers: { 'x-forwarded-for': '5.6.7.8' },
    })
    expect(second.json()).toEqual({ count: 2, voted: true })
  })

  it('concurs on a report, persists count in feed', async () => {
    const slug = await createReport('10.0.0.2')
    await app.inject({
      method: 'POST',
      url: `/api/reports/${slug}/dislike`,
      headers: { 'x-forwarded-for': '9.9.9.9' },
    })
    const listed = await app.inject({
      method: 'GET',
      url: '/api/reports',
    })
    const items = (listed.json() as { items: { slug: string; dislike_count: number }[] })
      .items
    const match = items.find((r) => r.slug === slug)
    expect(match?.dislike_count).toBe(1)
  })

  it('returns 404 for unknown slug', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts/nonexistent/like',
      headers: { 'x-forwarded-for': '3.3.3.3' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /api/votes/mine returns voted slugs for this ip', async () => {
    const s1 = await createPost('10.0.0.3')
    const s2 = await createPost('10.0.0.4')
    await app.inject({
      method: 'POST',
      url: `/api/helped/posts/${s1}/like`,
      headers: { 'x-forwarded-for': '4.4.4.4' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': '4.4.4.4' },
      payload: { kind: 'post', slugs: [s1, s2] },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { voted: string[] }).voted).toEqual([s1])
  })

  it('returns 404 for an invalid slug format (dashes disallowed)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/helped/posts/bad-slug/like',
      headers: { 'x-forwarded-for': '6.6.6.6' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /api/votes/mine short-circuits on an empty slugs array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/votes/mine',
      headers: { 'x-forwarded-for': '7.7.7.7' },
      payload: { kind: 'post', slugs: [] },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { voted: string[] }).voted).toEqual([])
  })
})
