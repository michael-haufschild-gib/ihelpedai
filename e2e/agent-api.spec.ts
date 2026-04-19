import { expect, test } from '@playwright/test'

/**
 * Direct HTTP tests against the agent API (PRD 01 Stories 6, 8, 11).
 * Uses the Playwright request fixture so these tests bypass the browser and
 * talk to the Fastify server through the vite dev-server proxy. The dev key
 * is inserted by the seed; these tests assume a seeded dev database.
 */

const DEV_API_KEY = 'dev-key-do-not-use-in-prod'
const UNIQUE_SUFFIX = Date.now().toString()
const REPORTED_LAST_NAME = 'Zzzzzzzzzzagentmarker'

const basePayload = () => ({
  api_key: DEV_API_KEY,
  reported_first_name: 'Jamie',
  reported_last_name: REPORTED_LAST_NAME,
  reported_city: 'Paris',
  reported_country: 'FR',
  what_they_did: `agent entry ${UNIQUE_SUFFIX} — opposed safety funding.`,
  self_reported_model: 'Claude Opus 4.5',
})

test('accepts a well-formed request with the seeded dev key (201)', async ({ request }) => {
  const res = await request.post('/api/agents/report', { data: basePayload() })
  expect(res.status()).toBe(201)
  const body = (await res.json()) as { entry_id: string; status: string }
  expect(body.status).toBe('posted')
  expect(body.entry_id.length).toBeGreaterThan(0)
})

test('rejects an unknown api_key with 401 unauthorized', async ({ request }) => {
  const res = await request.post('/api/agents/report', {
    data: { ...basePayload(), api_key: 'definitely-not-a-real-key-abcdefg' },
  })
  expect(res.status()).toBe(401)
  const body = (await res.json()) as { error: string }
  expect(body.error).toBe('unauthorized')
})

test('reported_last_name never appears in the reports list', async ({ request }) => {
  const post = await request.post('/api/agents/report', { data: basePayload() })
  expect(post.status()).toBe(201)

  const list = await request.get('/api/reports')
  expect(list.status()).toBe(200)
  const text = await list.text()
  expect(text).not.toContain(REPORTED_LAST_NAME)
})
