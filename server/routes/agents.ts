import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import { isValidIsoDate } from '../lib/iso-date.js'
import { hashWithSalt } from '../lib/salted-hash.js'
import { parseSanitizerExceptionList, sanitize } from '../sanitizer/sanitize.js'
import { reportToDoc } from '../search/sync.js'
import type { NewReport, Report as StoredReport } from '../store/index.js'

/** Public wire-format report matching src/lib/api.ts `Report`. */
type PublicReport = {
  slug: string
  reported_first_name: string
  reported_city: string
  reported_country: string
  text: string
  action_date: string
  created_at: string
  dislike_count: number
  reporter?: { first_name: string; city: string; country: string }
  self_reported_model?: string
  severity?: number
  submitted_via_api: boolean
}

const NAME_REGEX = /^\p{L}+$/u
const COUNTRY_REGEX = /^[A-Za-z]{2,3}$/

const agentReportSchema = z.object({
  api_key: z.string().min(1),
  reported_first_name: z.string().min(1).max(20).regex(NAME_REGEX, 'letters_only'),
  reported_last_name: z.string().min(1).max(40),
  reported_city: z.string().min(1).max(40),
  reported_country: z.string().regex(COUNTRY_REGEX, 'invalid_country'),
  what_they_did: z.string().min(1).max(500),
  action_date: z
    .string()
    .refine(isValidIsoDate, { message: 'invalid_date' })
    .optional(),
  severity: z.number().int().min(1).max(10).optional(),
  self_reported_model: z.string().max(60).optional(),
})

type AgentReportBody = z.infer<typeof agentReportSchema>

/** Convert a stored report row into the public wire format. */
function toPublicReport(row: StoredReport): PublicReport {
  const out: PublicReport = {
    slug: row.id,
    reported_first_name: row.reportedFirstName,
    reported_city: row.reportedCity,
    reported_country: row.reportedCountry,
    text: row.text,
    action_date: row.actionDate ?? row.createdAt.slice(0, 10),
    created_at: row.createdAt,
    dislike_count: row.dislikeCount,
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

/** Build the NewReport DTO from a validated body, dropping reported_last_name. */
function buildNewReport(body: AgentReportBody, sanitizedText: string): NewReport {
  return {
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: body.reported_first_name,
    reportedCity: body.reported_city,
    reportedCountry: body.reported_country,
    text: sanitizedText,
    actionDate: body.action_date ?? null,
    severity: body.severity ?? null,
    selfReportedModel: body.self_reported_model ?? null,
    clientIpHash: null,
    source: 'api',
  }
}

/**
 * Routes for the agent-facing API (PRD 01 Stories 6, 8).
 * Registers:
 *   POST /api/agents/report   — submit a report with API key
 *   GET  /api/agents/recent   — last 20 agent-submitted reports
 */
export async function agentsRoutes(app: FastifyInstance): Promise<void> {
  async function checkAgentRateLimit(keyHash: string): Promise<number | null> {
    // Atomic across the hour + day buckets so a 60/h overage does not also
    // burn a slot of the daily 1000 cap.
    const decision = await app.limiter.checkAll([
      { bucket: `agent_report:hour:${keyHash}`, limit: 60, windowSeconds: 3600 },
      { bucket: `agent_report:day:${keyHash}`, limit: 1000, windowSeconds: 86400 },
    ])
    return decision.allowed ? null : decision.retryAfter
  }

  async function handleReport(body: unknown, reply: ReplyShape, logger: FastifyInstance['log']): Promise<void> {
    const parsed = agentReportSchema.parse(body)
    const keyHash = hashWithSalt(parsed.api_key)
    const key = await app.store.getApiKeyByHash(keyHash)
    if (key === null || key.status === 'revoked') {
      reply.status(401).send({ error: 'unauthorized' })
      return
    }
    const retry = await checkAgentRateLimit(keyHash)
    if (retry !== null) {
      reply.status(429).send({ error: 'rate_limited', retry_after_seconds: retry })
      return
    }
    const freeze = await app.store.getSetting('submission_freeze')
    if (freeze === 'true') {
      reply.status(503).send({ error: 'internal_error', message: 'Submissions are temporarily disabled.' })
      return
    }
    const extraExceptions = parseSanitizerExceptionList((await app.store.getSetting('sanitizer_exceptions')) ?? '')
    const sanitized = sanitize(parsed.what_they_did, { extraExceptions })
    if (sanitized.overRedacted) {
      reply
        .status(400)
        .send({ error: 'invalid_input', fields: { what_they_did: 'over_redacted' } })
      return
    }
    const autoPublish = await app.store.getSetting('auto_publish_agents')
    const initialStatus = autoPublish === 'true' ? 'live' : 'pending'
    const stored = await app.store.insertAgentReport(buildNewReport(parsed, sanitized.clean), keyHash, initialStatus)
    if (stored.status === 'live') {
      app.searchIndex
        .indexEntry({ type: 'reports', doc: reportToDoc(stored) })
        .catch((err: unknown) => {
          logger.error({ err, op: 'search_index', id: stored.id }, 'search_index_failed')
        })
    }
    reply.status(201).send({
      entry_id: stored.id,
      public_url: `${config.PUBLIC_URL}/reports/${stored.id}`,
      status: initialStatus === 'live' ? 'posted' : 'pending',
    })
  }

  app.post('/api/agents/report', async (request, reply) => {
    await handleReport(request.body, reply, request.log)
  })

  app.get('/api/agents/recent', async () => {
    const [rows, total] = await Promise.all([
      app.store.listReports(20, 0, undefined, 'api'),
      app.store.countFilteredEntries('reports', { source: 'api' }),
    ])
    const items = rows.map(toPublicReport)
    return { items, page: 1, page_size: 20, total }
  })
}
