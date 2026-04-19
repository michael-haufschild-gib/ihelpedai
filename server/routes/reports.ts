import { createHash } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import { MemoryRateLimiter } from '../rate-limit/memory-limiter.js'
import type { RateLimiter } from '../rate-limit/index.js'
import { sanitize } from '../sanitizer/sanitize.js'
import { SqliteStore } from '../store/sqlite-store.js'
import type { Report as StoredReport, Store } from '../store/index.js'

/**
 * Routes for the anti-AI reports feature (PRD 01 Stories 4, 5, 10, 11).
 *
 *   POST /api/reports          — submit a new report (rate-limited per hashed IP,
 *                                `last_name` fields dropped at the handler boundary)
 *   GET  /api/reports          — paginated list (20 per page, optional ?q= search)
 *   GET  /api/reports/:slug    — single report by opaque slug
 *
 * The module lazily constructs its own Store and RateLimiter the first time a
 * handler runs so this route file stays self-contained and other Round 2
 * subagents can own sibling route modules without shared wiring.
 */

const PAGE_SIZE = 20
const FORM_LIMIT_PER_HOUR = 10
const HOUR_SECONDS = 60 * 60
const GLOBAL_LIMIT_PER_HOUR = 500
const GLOBAL_BUCKET = 'reports:global:hour'

/** Shape of the JSON response for a successful report creation. */
interface ReportCreatedResponse {
  slug: string
  public_url: string
  status: 'posted'
}

/** Shape of the JSON response for a paginated list of reports. */
interface PaginatedReportsResponse {
  items: ReportJson[]
  page: number
  page_size: number
  total: number
}

/** Public-facing JSON shape of a report. Mirrors `src/lib/api.ts` `Report`. */
interface ReportJson {
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

const reporterSchema = z.object({
  first_name: z.string().max(20),
  last_name: z.string().max(40),
  city: z.string().max(40),
  country: z.string().max(2),
})

const bodySchema = z.object({
  reporter: reporterSchema,
  reported_first_name: z.string().min(1).max(20),
  reported_last_name: z.string().min(1).max(40),
  reported_city: z.string().min(1).max(40),
  reported_country: z.string().min(1).max(2),
  what_they_did: z.string().min(1).max(500),
  action_date: z.string().max(20).optional(),
})

type ReportBody = z.infer<typeof bodySchema>

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
})

let storeInstance: Store | null = null
let limiterInstance: RateLimiter | null = null

const getStore = (): Store => {
  if (storeInstance === null) storeInstance = new SqliteStore(config.SQLITE_PATH)
  return storeInstance
}

const getLimiter = (): RateLimiter => {
  if (limiterInstance === null) limiterInstance = new MemoryRateLimiter()
  return limiterInstance
}

const hashIp = (ip: string): string =>
  createHash('sha256').update(`${config.IP_HASH_SALT}:${ip}`).digest('hex')

const reporterToStorage = (
  reporter: ReportBody['reporter'],
): Pick<
  StoredReport,
  'reporterFirstName' | 'reporterCity' | 'reporterCountry'
> => {
  if (reporter.first_name.trim() === '') {
    return { reporterFirstName: null, reporterCity: null, reporterCountry: null }
  }
  return {
    reporterFirstName: reporter.first_name,
    reporterCity: reporter.city === '' ? null : reporter.city,
    reporterCountry: reporter.country === '' ? null : reporter.country,
  }
}

const storedToJson = (row: StoredReport): ReportJson => {
  const out: ReportJson = {
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

const buildPublicUrl = (slug: string): string => `${config.PUBLIC_URL}/reports/${slug}`

const checkRateLimits = async (
  reply: FastifyReply,
  ipHash: string,
): Promise<boolean> => {
  const limiter = getLimiter()
  const perIp = await limiter.check(`reports:ip:${ipHash}`, FORM_LIMIT_PER_HOUR, HOUR_SECONDS)
  if (!perIp.allowed) {
    await reply
      .code(429)
      .send({ error: 'rate_limited', retry_after_seconds: perIp.retryAfter })
    return false
  }
  const global = await limiter.check(GLOBAL_BUCKET, GLOBAL_LIMIT_PER_HOUR, HOUR_SECONDS)
  if (!global.allowed) {
    await reply
      .code(429)
      .send({ error: 'rate_limited', retry_after_seconds: global.retryAfter })
    return false
  }
  return true
}

const handleCreate = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ReportCreatedResponse | undefined> => {
  const body = bodySchema.parse(request.body)
  const ipHash = hashIp(request.ip)

  if (!(await checkRateLimits(reply, ipHash))) return undefined

  const sanitized = sanitize(body.what_they_did)
  if (sanitized.overRedacted) {
    await reply
      .code(400)
      .send({ error: 'invalid_input', fields: { what_they_did: 'over_redacted' } })
    return undefined
  }

  // `last_name` fields from both reporter and reported-person are validated
  // above and then dropped here. The Store's NewReport type has no field
  // named `last_name`, so the type system verifies the drop.
  const storedRow = await getStore().insertReport({
    ...reporterToStorage(body.reporter),
    reportedFirstName: body.reported_first_name,
    reportedCity: body.reported_city,
    reportedCountry: body.reported_country,
    text: sanitized.clean,
    actionDate: body.action_date === undefined || body.action_date === '' ? null : body.action_date,
    severity: null,
    selfReportedModel: null,
    clientIpHash: ipHash,
    source: 'form',
  })
  return {
    slug: storedRow.id,
    public_url: buildPublicUrl(storedRow.id),
    status: 'posted',
  }
}

const handleList = async (request: FastifyRequest): Promise<PaginatedReportsResponse> => {
  const parsed = listQuerySchema.parse(request.query)
  const page = parsed.page ?? 1
  const offset = (page - 1) * PAGE_SIZE
  // Over-fetch by 1 so we can compute `hasMore` without a separate count query.
  const rows = await getStore().listReports(PAGE_SIZE + 1, offset, parsed.q, 'all')
  const hasMore = rows.length > PAGE_SIZE
  const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map(storedToJson)
  const total = hasMore ? offset + PAGE_SIZE + 1 : offset + items.length
  return { items, page, page_size: PAGE_SIZE, total }
}

const handleGetOne = async (
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply,
): Promise<ReportJson | undefined> => {
  const row = await getStore().getReport(request.params.slug)
  if (row === null) {
    await reply.code(404).send({ error: 'not_found' })
    return undefined
  }
  return storedToJson(row)
}

/** Register the three reports endpoints on the Fastify instance. */
export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/reports', handleCreate)
  app.get('/api/reports', handleList)
  app.get<{ Params: { slug: string } }>('/api/reports/:slug', handleGetOne)
}
