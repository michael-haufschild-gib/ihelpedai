import { createHash } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import type { RateLimiter } from '../rate-limit/index.js'
import { sanitize } from '../sanitizer/sanitize.js'
import type { SearchIndex } from '../search/index.js'
import { reportToDoc } from '../search/sync.js'
import type { Report as StoredReport, Store } from '../store/index.js'

/**
 * Routes for the anti-AI reports feature (PRD 01 Stories 4, 5, 10, 11).
 *
 *   POST /api/reports          — submit a new report (rate-limited per hashed IP,
 *                                `last_name` fields dropped at the handler boundary)
 *   GET  /api/reports          — paginated list (20 per page, optional ?q= search)
 *   GET  /api/reports/:slug    — single report by opaque slug
 */

const PAGE_SIZE = 20
const NAME_REGEX = /^\p{L}+$/u
const FORM_LIMIT_PER_HOUR = 10
const FORM_LIMIT_PER_DAY = 50
const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * HOUR_SECONDS
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

const reporterSchema = z
  .object({
    first_name: z.string().max(20).refine(
      (v) => v.trim() === '' || NAME_REGEX.test(v), { message: 'letters_only' },
    ),
    last_name: z.string().max(40),
    city: z.string().max(40),
    country: z.string().max(2),
  })
  .refine(
    (v) =>
      v.first_name.trim() === '' ||
      (v.city.trim() !== '' && v.country.trim() !== ''),
    { path: ['city'], message: 'reporter_location_required' },
  )

const bodySchema = z.object({
  reporter: reporterSchema,
  reported_first_name: z.string().min(1).max(20).regex(NAME_REGEX, 'letters_only'),
  reported_last_name: z.string().min(1).max(40),
  reported_city: z.string().min(1).max(40),
  reported_country: z.string().min(1).max(2),
  what_they_did: z.string().min(1).max(500),
  action_date: z
    .string()
    .max(20)
    .refine(
      (v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v),
      { message: 'invalid_date' },
    )
    .optional(),
})

type ReportBody = z.infer<typeof bodySchema>

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
})

const slugParamsSchema = z.object({
  slug: z.string().min(1).max(64),
})

const effectiveLimit = (base: number): number =>
  config.NODE_ENV === 'production'
    ? base
    : Math.max(1, Math.floor(base * config.DEV_RATE_MULTIPLIER))

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

/** Enforce per-IP hourly/daily and global hourly rate limits. Replies with 429 on denial. */
async function checkRateLimits(
  limiter: RateLimiter,
  reply: FastifyReply,
  ipHash: string,
): Promise<boolean> {
  const perIpHour = await limiter.check(
    `reports:ip:hour:${ipHash}`,
    effectiveLimit(FORM_LIMIT_PER_HOUR),
    HOUR_SECONDS,
  )
  if (!perIpHour.allowed) {
    await reply.code(429).send({ error: 'rate_limited', retry_after_seconds: perIpHour.retryAfter })
    return false
  }
  const perIpDay = await limiter.check(
    `reports:ip:day:${ipHash}`,
    effectiveLimit(FORM_LIMIT_PER_DAY),
    DAY_SECONDS,
  )
  if (!perIpDay.allowed) {
    await reply.code(429).send({ error: 'rate_limited', retry_after_seconds: perIpDay.retryAfter })
    return false
  }
  const global = await limiter.check(
    GLOBAL_BUCKET,
    effectiveLimit(GLOBAL_LIMIT_PER_HOUR),
    HOUR_SECONDS,
  )
  if (!global.allowed) {
    await reply.code(429).send({ error: 'rate_limited', retry_after_seconds: global.retryAfter })
    return false
  }
  return true
}

/** POST /api/reports handler. Validates, rate-limits, sanitizes, stores, returns 201. */
async function handleCreate(
  store: Store,
  limiter: RateLimiter,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ReportCreatedResponse | undefined> {
  const freeze = await store.getSetting('submission_freeze')
  if (freeze === 'true') {
    await reply.code(503).send({ error: 'internal_error', message: 'Submissions are temporarily disabled.' })
    return undefined
  }
  const body = bodySchema.parse(request.body)
  const ipHash = hashIp(request.ip)

  if (!(await checkRateLimits(limiter, reply, ipHash))) return undefined

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
  const storedRow = await store.insertReport({
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
  indexReportFireAndForget(request, storedRow)
  reply.code(201)
  return {
    slug: storedRow.id,
    public_url: buildPublicUrl(storedRow.id),
    status: 'posted',
  }
}

/**
 * Mirror a live report into the search index. Fire-and-forget so the write
 * path stays fast and decoupled from Meili health.
 */
function indexReportFireAndForget(request: FastifyRequest, report: StoredReport): void {
  if (report.status !== 'live') return
  request.server.searchIndex
    .indexEntry({ type: 'reports', doc: reportToDoc(report) })
    .catch((err: unknown) => {
      request.log.error({ err, op: 'search_index', id: report.id }, 'search_index_failed')
    })
}

/** GET /api/reports handler. Paginated listing with optional ?q= substring. */
async function handleList(
  store: Store,
  search: SearchIndex,
  request: FastifyRequest,
): Promise<PaginatedReportsResponse> {
  const parsed = listQuerySchema.parse(request.query)
  const page = parsed.page ?? 1
  const offset = (page - 1) * PAGE_SIZE
  const trimmedQuery = typeof parsed.q === 'string' ? parsed.q.trim() : ''
  const query = trimmedQuery.length > 0 ? trimmedQuery : undefined
  const { rows, total } = query === undefined
    ? await listReportsUnfiltered(store, offset)
    : await searchReportsWithFallback(store, search, query, page, request)
  return { items: rows.map(storedToJson), page, page_size: PAGE_SIZE, total }
}

async function listReportsUnfiltered(
  store: Store,
  offset: number,
): Promise<{ rows: StoredReport[]; total: number }> {
  const [rows, total] = await Promise.all([
    store.listReports(PAGE_SIZE, offset, undefined, 'all'),
    store.countFilteredEntries('reports', { query: undefined }),
  ])
  return { rows, total }
}

async function searchReportsWithFallback(
  store: Store,
  search: SearchIndex,
  query: string,
  page: number,
  request: FastifyRequest,
): Promise<{ rows: StoredReport[]; total: number }> {
  const offset = (page - 1) * PAGE_SIZE
  const fallbackFromStore = async (): Promise<{ rows: StoredReport[]; total: number }> => {
    const [rows, total] = await Promise.all([
      store.listReports(PAGE_SIZE, offset, query, 'all'),
      store.countFilteredEntries('reports', { query }),
    ])
    return { rows, total }
  }
  try {
    const { ids, total } = await search.search('reports', query, PAGE_SIZE, page)
    const rows = await store.getReportsByIds(ids)
    if (rows.length !== ids.length) {
      request.log.warn(
        { op: 'search', type: 'reports', requested: ids.length, hydrated: rows.length },
        'search_hydration_mismatch_fallback',
      )
      return fallbackFromStore()
    }
    return { rows, total }
  } catch (err) {
    request.log.error({ err, op: 'search', type: 'reports' }, 'search_failed_fallback')
    return fallbackFromStore()
  }
}

/** GET /api/reports/:slug handler. Returns the report JSON or 404. */
async function handleGetOne(
  store: Store,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ReportJson | undefined> {
  const parsed = slugParamsSchema.safeParse(request.params)
  if (!parsed.success) {
    await reply.code(404).send({ error: 'not_found' })
    return undefined
  }
  const row = await store.getReport(parsed.data.slug)
  if (row === null) {
    await reply.code(404).send({ error: 'not_found' })
    return undefined
  }
  return storedToJson(row)
}

/** Register the three reports endpoints on the Fastify instance. */
export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/reports', (req, reply) => handleCreate(app.store, app.limiter, req, reply))
  app.get('/api/reports', (req) => handleList(app.store, app.searchIndex, req))
  app.get('/api/reports/:slug', (req, reply) => handleGetOne(app.store, req, reply))
}
