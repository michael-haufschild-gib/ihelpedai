import { createHash } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import { MemoryRateLimiter } from '../rate-limit/memory-limiter.js'
import { sanitize } from '../sanitizer/sanitize.js'
import type { NewReport, Report as StoredReport, Store } from '../store/index.js'
import { SqliteStore } from '../store/sqlite-store.js'

/** Public wire-format report matching src/lib/api.ts `Report`. */
type PublicReport = {
  slug: string
  reported_first_name: string
  reported_city: string
  reported_country: string
  text: string
  action_date: string
  created_at: string
  reporter?: { first_name: string; city: string; country: string }
  self_reported_model?: string
  severity?: number
  submitted_via_api: boolean
}

const LETTERS_ONLY = /^[\p{L}\s'-]+$/u

const agentReportSchema = z.object({
  api_key: z.string().min(1),
  reported_first_name: z.string().min(1).max(20).regex(LETTERS_ONLY, 'letters_only'),
  reported_last_name: z.string().min(1).max(40),
  reported_city: z.string().min(1).max(40),
  reported_country: z.string().min(2).max(3),
  what_they_did: z.string().min(1).max(500),
  action_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  severity: z.number().int().min(1).max(10).optional(),
  self_reported_model: z.string().max(60).optional(),
})

type AgentReportBody = z.infer<typeof agentReportSchema>

let storeSingleton: Store | null = null
let limiterSingleton: MemoryRateLimiter | null = null

/** Lazy-initialized SQLite store (dev). Single instance per process. */
function getStore(): Store {
  if (storeSingleton === null) storeSingleton = new SqliteStore(config.SQLITE_PATH)
  return storeSingleton
}

/** Lazy-initialized in-memory rate limiter. Single instance per process. */
function getLimiter(): MemoryRateLimiter {
  if (limiterSingleton === null) limiterSingleton = new MemoryRateLimiter()
  return limiterSingleton
}

/** Hash a value with sha256 using the server-side salt. */
function hashWithSalt(value: string): string {
  return createHash('sha256').update(`${config.IP_HASH_SALT}:${value}`).digest('hex')
}

/** Convert a stored report row into the public wire format. */
function toPublicReport(row: StoredReport): PublicReport {
  const out: PublicReport = {
    slug: row.id,
    reported_first_name: row.reportedFirstName,
    reported_city: row.reportedCity,
    reported_country: row.reportedCountry,
    text: row.text,
    action_date: row.actionDate ?? '',
    created_at: row.createdAt,
    submitted_via_api: row.source === 'api',
  }
  if (row.reporterFirstName !== null) {
    out.reporter = {
      first_name: row.reporterFirstName,
      city: row.reporterCity ?? '',
      country: row.reporterCountry ?? '',
    }
  }
  if (row.selfReportedModel !== null) out.self_reported_model = row.selfReportedModel
  if (row.severity !== null) out.severity = row.severity
  return out
}

type ReplyShape = {
  status: (code: number) => { send: (payload: unknown) => void }
}

/** Per-key rate check. Returns `null` when allowed, otherwise a retry_after. */
async function checkAgentRateLimit(keyHash: string): Promise<number | null> {
  const limiter = getLimiter()
  const hour = await limiter.check(`agent_report:hour:${keyHash}`, 60, 3600)
  if (!hour.allowed) return hour.retryAfter
  const day = await limiter.check(`agent_report:day:${keyHash}`, 1000, 86400)
  if (!day.allowed) return day.retryAfter
  return null
}

/** Build the NewReport DTO from a validated body, dropping reported_last_name. */
function buildNewReport(body: AgentReportBody): NewReport {
  const { what_they_did, ...rest } = body
  const sanitized = sanitize(what_they_did)
  return {
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: rest.reported_first_name,
    reportedCity: rest.reported_city,
    reportedCountry: rest.reported_country,
    text: sanitized.clean,
    actionDate: rest.action_date ?? null,
    severity: rest.severity ?? null,
    selfReportedModel: rest.self_reported_model ?? null,
    clientIpHash: null,
    source: 'api',
  }
}

/** Handle POST /api/agents/report — validates, authenticates, rate-limits, sanitizes, stores. */
async function handleReport(body: unknown, reply: ReplyShape): Promise<void> {
  const parsed = agentReportSchema.parse(body)
  const keyHash = hashWithSalt(parsed.api_key)
  const store = getStore()
  const key = await store.getApiKeyByHash(keyHash)
  if (key === null || key.status === 'revoked') {
    reply.status(401).send({ error: 'unauthorized' })
    return
  }
  const retry = await checkAgentRateLimit(keyHash)
  if (retry !== null) {
    reply.status(429).send({ error: 'rate_limited', retry_after_seconds: retry })
    return
  }
  const sanitized = sanitize(parsed.what_they_did)
  if (sanitized.overRedacted) {
    reply
      .status(400)
      .send({ error: 'invalid_input', fields: { what_they_did: 'over_redacted' } })
    return
  }
  const stored = await store.insertReport(buildNewReport(parsed))
  await store.incrementApiKeyUsage(keyHash)
  reply.status(201).send({
    entry_id: stored.id,
    public_url: `/reports/${stored.id}`,
    status: 'posted',
  })
}

/**
 * Routes for the agent-facing API (PRD 01 Stories 6, 8).
 * Registers:
 *   POST /api/agents/report   — submit a report with API key
 *   GET  /api/agents/recent   — last 20 agent-submitted reports
 */
export async function agentsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/agents/report', async (request, reply) => {
    await handleReport(request.body, reply)
  })

  app.get('/api/agents/recent', async () => {
    const rows = await getStore().listReports(20, 0, undefined, 'api')
    const items = rows.map(toPublicReport)
    return { items, page: 1, page_size: 20, total: items.length }
  })
}
