import { createHash } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import { MemoryRateLimiter } from '../rate-limit/memory-limiter.js'
import type { RateLimiter } from '../rate-limit/index.js'
import { sanitize } from '../sanitizer/sanitize.js'
import type { Post, Store } from '../store/index.js'
import { SqliteStore } from '../store/sqlite-store.js'

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

/**
 * Module-scoped dev dependencies. Instantiated on import so the route module
 * stays a single registrar; other feature modules will follow the same pattern.
 * A full shared-state design (one Store, one RateLimiter for the whole app) is
 * a Round 3 integration task.
 */
const store: Store = new SqliteStore(config.SQLITE_PATH)
const limiter: RateLimiter = new MemoryRateLimiter()

/** Multiplies a raw limit by DEV_RATE_MULTIPLIER except in production. */
const effectiveLimit = (base: number): number =>
  config.NODE_ENV === 'production' ? base : Math.max(1, Math.floor(base * config.DEV_RATE_MULTIPLIER))

/** Hashes the client IP with the server-side salt for rate-limit bucketing. */
const hashIp = (ip: string | undefined): string => {
  if (ip === undefined || ip === '') return 'unknown'
  return createHash('sha256').update(`${ip}|${config.IP_HASH_SALT}`).digest('hex').slice(0, 32)
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

/**
 * Checks all rate-limit buckets for an incoming POST. Returns the retryAfter
 * in seconds if any bucket is exhausted, or null if the request may proceed.
 */
async function checkRateLimits(ipHash: string): Promise<number | null> {
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

/** POST handler: validates, sanitizes, rate-limits, and stores a new post. */
async function handleCreate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ipHash = hashIp(request.ip)
  const retryAfter = await checkRateLimits(ipHash)
  if (retryAfter !== null) {
    reply.code(429).send({ error: 'rate_limited', retry_after_seconds: retryAfter })
    return
  }

  const parsed = helpedPostInput.safeParse(request.body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (Array.isArray(v) && v.length > 0) fields[k] = v[0]
    }
    reply.code(400).send({ error: 'invalid_input', fields })
    return
  }

  const { first_name, city, country, text } = parsed.data
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
  reply.code(201).send({
    slug: saved.id,
    public_url: `${config.PUBLIC_URL}/feed/${saved.id}`,
    status: 'posted',
  })
}

/** GET list handler: paginated, optionally filtered by `q`. */
async function handleList(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = listQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    reply.code(400).send({ error: 'invalid_input' })
    return
  }
  const { q, page } = parsed.data
  const offset = (page - 1) * PAGE_SIZE
  const query = typeof q === 'string' && q.length > 0 ? q : undefined
  const rows = await store.listPosts(PAGE_SIZE + 1, offset, query)
  const hasMore = rows.length > PAGE_SIZE
  const items = rows.slice(0, PAGE_SIZE).map(toWire)
  const body: PaginatedWire<HelpedPostWire> = {
    items,
    page,
    page_size: PAGE_SIZE,
    total: offset + items.length + (hasMore ? 1 : 0),
  }
  reply.code(200).send(body)
}

/** GET one handler: returns a single live post by slug, or 404. */
async function handleGetOne(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { slug } = request.params as { slug: string }
  const post = await store.getPost(slug)
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
  app.post('/api/helped/posts', handleCreate)
  app.get('/api/helped/posts', handleList)
  app.get('/api/helped/posts/:slug', handleGetOne)
}
