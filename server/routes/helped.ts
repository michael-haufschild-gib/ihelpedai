import { createHash } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import type { RateLimiter } from '../rate-limit/index.js'
import { sanitize } from '../sanitizer/sanitize.js'
import type { SearchIndex } from '../search/index.js'
import { postToDoc } from '../search/sync.js'
import type { Post, Store } from '../store/index.js'

/**
 * Shape returned on the public wire for a single post. `last_name` is never
 * emitted because it is dropped at the HTTP boundary.
 */
type HelpedPostWire = {
  slug: string
  first_name: string
  city: string
  country: string
  text: string
  like_count: number
  created_at: string
}

/** Result of paginated list endpoints. */
type PaginatedWire<T> = {
  items: T[]
  page: number
  page_size: number
  total: number
}

const PAGE_SIZE = 20

// Per-IP and global caps per PRD Story 10. DEV_RATE_MULTIPLIER relaxes limits
// during local development so manual testing does not hit them.
const PER_IP_HOURLY_LIMIT = 10
const PER_IP_DAILY_LIMIT = 50
const GLOBAL_HOURLY_LIMIT = 500
const ONE_HOUR_SECONDS = 60 * 60
const ONE_DAY_SECONDS = 24 * 60 * 60

const NAME_REGEX = /^\p{L}+$/u
const CITY_REGEX = /^[\p{L}\s'-]+$/u
const COUNTRY_REGEX = /^[A-Z]{2}$/

/**
 * Zod schema for the `POST /api/helped/posts` body. Validates `last_name` as
 * required (PRD Story 11 AC1) then drops it at the handler boundary — the
 * storage layer has no `last_name` column.
 */
const helpedPostInput = z.object({
  first_name: z.string().min(1).max(20).regex(NAME_REGEX, 'letters_only'),
  last_name: z.string().min(1).max(40),
  city: z.string().min(1).max(40).regex(CITY_REGEX, 'invalid_city'),
  country: z.string().regex(COUNTRY_REGEX, 'invalid_country'),
  text: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => v.trim().length > 0, 'empty'),
})

/** Zod schema for query-string params on the list endpoint. */
const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

/** Zod schema for the :slug route param. */
const slugParamsSchema = z.object({
  slug: z.string().min(1).max(64),
})

/** Multiplies a raw limit by DEV_RATE_MULTIPLIER except in production. */
const effectiveLimit = (base: number): number =>
  config.NODE_ENV === 'production' ? base : Math.max(1, Math.floor(base * config.DEV_RATE_MULTIPLIER))

/** Hashes the client IP with the server-side salt for rate-limit bucketing. */
const hashIp = (ip: string | undefined): string => {
  if (ip === undefined || ip === '') return 'unknown'
  return createHash('sha256').update(`${config.IP_HASH_SALT}:${ip}`).digest('hex')
}

/** Maps a stored Post row onto the public wire shape. */
const toWire = (p: Post): HelpedPostWire => ({
  slug: p.id,
  first_name: p.firstName,
  city: p.city,
  country: p.country,
  text: p.text,
  like_count: p.likeCount,
  created_at: p.createdAt,
})

/** Runs the three rate-limit checks. Returns retry-after seconds if any bucket denies. */
async function checkRateLimits(limiter: RateLimiter, ipHash: string): Promise<number | null> {
  const hour = await limiter.check(
    `helped:post:hour:${ipHash}`,
    effectiveLimit(PER_IP_HOURLY_LIMIT),
    ONE_HOUR_SECONDS,
  )
  if (!hour.allowed) return hour.retryAfter
  const day = await limiter.check(
    `helped:post:day:${ipHash}`,
    effectiveLimit(PER_IP_DAILY_LIMIT),
    ONE_DAY_SECONDS,
  )
  if (!day.allowed) return day.retryAfter
  const global = await limiter.check(
    'helped:post:hour:global',
    effectiveLimit(GLOBAL_HOURLY_LIMIT),
    ONE_HOUR_SECONDS,
  )
  if (!global.allowed) return global.retryAfter
  return null
}

/** POST /api/helped/posts handler. Validates, sanitizes, rate-limits, and stores. */
async function handleCreate(
  store: Store,
  limiter: RateLimiter,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const freeze = await store.getSetting('submission_freeze')
  if (freeze === 'true') {
    reply.code(503).send({ error: 'internal_error', message: 'Submissions are temporarily disabled.' })
    return
  }
  const ipHash = hashIp(request.ip)
  const retryAfter = await checkRateLimits(limiter, ipHash)
  if (retryAfter !== null) {
    reply.code(429).send({ error: 'rate_limited', retry_after_seconds: retryAfter })
    return
  }

  const parsed = helpedPostInput.parse(request.body)
  const { first_name, city, country, text } = parsed
  const sanitized = sanitize(text)
  if (sanitized.overRedacted) {
    reply.code(400).send({ error: 'invalid_input', fields: { text: 'over_redacted' } })
    return
  }

  const saved = await store.insertPost({
    firstName: first_name,
    city,
    country,
    text: sanitized.clean,
    clientIpHash: ipHash,
    source: 'form',
  })
  indexPostFireAndForget(request, saved)
  reply.code(201).send({
    slug: saved.id,
    public_url: `${config.PUBLIC_URL}/feed/${saved.id}`,
    status: 'posted',
  })
}

/**
 * Mirror a live post into the search index. Fire-and-forget: write-path
 * latency and success are independent of Meili health. Only live rows are
 * indexed — pending/deleted status transitions are handled in admin routes.
 */
function indexPostFireAndForget(request: FastifyRequest, post: Post): void {
  if (post.status !== 'live') return
  request.server.searchIndex
    .indexEntry({ type: 'posts', doc: postToDoc(post) })
    .catch((err: unknown) => {
      request.log.error({ err, op: 'search_index', id: post.id }, 'search_index_failed')
    })
}

/** GET /api/helped/posts handler. Paginated, optional ?q= substring filter. */
async function handleList(
  store: Store,
  search: SearchIndex,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = listQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_input' })
    return
  }
  const { q, page } = parsed.data
  const offset = (page - 1) * PAGE_SIZE
  const query = typeof q === 'string' && q.length > 0 ? q : undefined
  const { rows, total } = query === undefined
    ? await listUnfiltered(store, offset)
    : await searchPostsWithFallback(store, search, query, page, request)
  const body: PaginatedWire<HelpedPostWire> = {
    items: rows.map(toWire),
    page,
    page_size: PAGE_SIZE,
    total,
  }
  reply.code(200).send(body)
}

/** Unfiltered feed path — newest-first, no ranking. */
async function listUnfiltered(
  store: Store,
  offset: number,
): Promise<{ rows: Post[]; total: number }> {
  const [rows, total] = await Promise.all([
    store.listPosts(PAGE_SIZE, offset, undefined),
    store.countFilteredEntries('posts', { query: undefined }),
  ])
  return { rows, total }
}

/**
 * Search path: Meili returns ids + exact total; the store hydrates rows so
 * display fields (like_count) come from the source-of-truth. If Meili throws,
 * fall back to the store's LIKE query so search remains functional under a
 * Meili outage.
 */
async function searchPostsWithFallback(
  store: Store,
  search: SearchIndex,
  query: string,
  page: number,
  request: FastifyRequest,
): Promise<{ rows: Post[]; total: number }> {
  const offset = (page - 1) * PAGE_SIZE
  const fallbackFromStore = async (): Promise<{ rows: Post[]; total: number }> => {
    const [rows, total] = await Promise.all([
      store.listPosts(PAGE_SIZE, offset, query),
      store.countFilteredEntries('posts', { query }),
    ])
    return { rows, total }
  }
  try {
    const { ids, total } = await search.search('posts', query, PAGE_SIZE, page)
    const rows = await store.getPostsByIds(ids)
    // getPostsByIds filters out non-'live' rows, so when the search index is
    // lagging a status transition it can return fewer hydrated rows than ids.
    // That would show short/empty pages alongside a nonzero `total`; fall
    // back to the store so `items` and `total` stay consistent.
    if (rows.length !== ids.length) {
      request.log.warn(
        { op: 'search', type: 'posts', requested: ids.length, hydrated: rows.length },
        'search_hydration_mismatch_fallback',
      )
      return fallbackFromStore()
    }
    return { rows, total }
  } catch (err) {
    request.log.error({ err, op: 'search', type: 'posts' }, 'search_failed_fallback')
    return fallbackFromStore()
  }
}

/** GET /api/helped/posts/:slug handler. Returns the live post or 404. */
async function handleGetOne(
  store: Store,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = slugParamsSchema.safeParse(request.params)
  if (!parsed.success) {
    reply.code(404).send({ error: 'not_found' })
    return
  }
  const post = await store.getPost(parsed.data.slug)
  if (post === null || post.status !== 'live') {
    reply.code(404).send({ error: 'not_found' })
    return
  }
  reply.code(200).send(toWire(post))
}

/**
 * Routes for the "I helped" feature (PRD 01 Stories 2, 3, 11). Implements:
 *   POST /api/helped/posts        — create, with sanitizer + rate limit
 *   GET  /api/helped/posts?q=&page=  — list, 20 per page, naive q filter
 *   GET  /api/helped/posts/:slug   — single post or 404
 *
 * `last_name` is validated (Zod) for presence then discarded at this handler
 * boundary per PRD Story 11; the Store layer never receives it.
 */
export async function helpedRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/helped/posts', (req, reply) => handleCreate(app.store, app.limiter, req, reply))
  app.get('/api/helped/posts', (req, reply) => handleList(app.store, app.searchIndex, req, reply))
  app.get('/api/helped/posts/:slug', (req, reply) => handleGetOne(app.store, req, reply))
}
