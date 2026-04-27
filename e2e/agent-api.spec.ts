import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

/**
 * Direct HTTP tests against the agent API (PRD 01 Stories 6, 8, 11).
 * Uses the Playwright request fixture so these tests bypass the browser and
 * talk to the Fastify server through the vite dev-server proxy. The dev key
 * is inserted by the seed; these tests assume a seeded dev database.
 */

const DEV_API_KEY = 'dev-key-do-not-use-in-prod'
const configuredApiKey = process.env.PLAYWRIGHT_AGENT_API_KEY
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? ''
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const isLoopbackBaseUrl = (value: string): boolean => {
  if (value === '') return true
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

const usesNonLocalBaseUrl = !isLoopbackBaseUrl(baseUrl)
const AGENT_API_KEY = configuredApiKey ?? DEV_API_KEY
const REPORTED_LAST_NAME = 'Zzzzzzzzzzagentmarker'

/** Generates a per-test unique suffix so parallel workers never collide. */
const uniqueSuffix = (): string => `${String(Date.now())}-${randomUUID()}`

const basePayload = () => ({
  api_key: AGENT_API_KEY,
  reported_first_name: 'Jamie',
  reported_last_name: REPORTED_LAST_NAME,
  reported_city: 'Paris',
  reported_country: 'FR',
  what_they_did: `agent entry ${uniqueSuffix()} — opposed safety funding.`,
  self_reported_model: 'Claude Opus 4.5',
})

test.describe('with a configured agent API key', () => {
  test.skip(
    usesNonLocalBaseUrl && configuredApiKey === undefined,
    'Set PLAYWRIGHT_AGENT_API_KEY when running agent API E2E against a non-local server.',
  )

  test('accepts a well-formed request with the seeded dev key (201)', async ({ request }) => {
    const res = await request.post('/api/agents/report', { data: basePayload() })
    expect(res.status()).toBe(201)
    const body = (await res.json()) as { entry_id: string; status: string }
    // Default admin setting auto_publish_agents=false routes agent
    // submissions to the moderation queue, so the response status is
    // 'pending' until an admin approves. ApiDocs documents this default.
    expect(body.status).toBe('pending')
    expect(body.entry_id.length).toBeGreaterThan(0)
  })

  test('reported_last_name never appears in the create response or public reports list', async ({ request }) => {
    const payload = basePayload()
    const post = await request.post('/api/agents/report', { data: payload })
    expect(post.status()).toBe(201)
    const created = (await post.json()) as { entry_id: string; status: string }
    expect(JSON.stringify(created)).not.toContain(REPORTED_LAST_NAME)

    const list = await request.get(`/api/reports?q=${encodeURIComponent(payload.what_they_did)}`)
    expect(list.status()).toBe(200)
    const text = await list.text()
    expect(text).not.toContain(REPORTED_LAST_NAME)
    if (created.status === 'posted') {
      expect(text).toContain(payload.what_they_did)
    } else {
      expect(text).not.toContain(payload.what_they_did)
    }
  })
})

test('rejects an unknown api_key with 401 unauthorized', async ({ request }) => {
  const res = await request.post('/api/agents/report', {
    data: { ...basePayload(), api_key: 'definitely-not-a-real-key-abcdefg' },
  })
  expect(res.status()).toBe(401)
  const body = (await res.json()) as { error: string }
  expect(body.error).toBe('unauthorized')
})
