import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { effectiveLimit } from '../lib/effective-limit.js'
import { hashWithSalt } from '../lib/salted-hash.js'
import type { VoteKind } from '../store/index.js'

/**
 * Votes endpoints. Anonymous, IP-deduped acknowledge/concur.
 *
 *   POST /api/helped/posts/:slug/like        — toggle "acknowledge" on a post
 *   POST /api/reports/:slug/dislike          — toggle "concur" on a report
 *   POST /api/votes/mine                     — fetch which slugs this ip has voted
 *
 * Dedup is per `sha256(IP_HASH_SALT:ip)`; shared NAT gateways share a bucket.
 * Acceptable for this site; documented in project README.
 */

const VOTE_LIMIT_PER_HOUR = 60
// /api/votes/mine is a read-only "which of these did I vote on" probe. A
// higher budget than the toggle endpoint (60/h) lets a feed page refresh
// its vote state without tripping, but a hard cap prevents enumeration of
// vote state across many IPs via bulk requests.
const MINE_LIMIT_PER_HOUR = 300
const HOUR_SECONDS = 60 * 60
const SLUG_RE = /^[A-Za-z0-9]{1,32}$/
const MAX_MINE_SLUGS = 50

const mineBodySchema = z.object({
  kind: z.enum(['post', 'report']),
  slugs: z.array(z.string().regex(SLUG_RE)).max(MAX_MINE_SLUGS),
})

/** Register vote endpoints on the Fastify instance. */
export async function votesRoutes(app: FastifyInstance): Promise<void> {
  async function enforceVoteLimit(reply: FastifyReply, ipHash: string): Promise<boolean> {
    const decision = await app.limiter.check(
      `vote:hour:${ipHash}`,
      effectiveLimit(VOTE_LIMIT_PER_HOUR),
      HOUR_SECONDS,
    )
    if (!decision.allowed) {
      await reply
        .code(429)
        .send({ error: 'rate_limited', retry_after_seconds: decision.retryAfter })
      return false
    }
    return true
  }

  async function handleToggle(
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
    kind: VoteKind,
  ): Promise<{ count: number; voted: boolean } | undefined> {
    const { slug } = request.params
    if (!SLUG_RE.test(slug)) {
      await reply.code(404).send({ error: 'not_found' })
      return undefined
    }
    const ipHash = hashWithSalt(request.ip)
    if (!(await enforceVoteLimit(reply, ipHash))) return undefined
    const result = await app.store.toggleVote(slug, kind, ipHash)
    if (result === null) {
      await reply.code(404).send({ error: 'not_found' })
      return undefined
    }
    return result
  }

  async function handleMine(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ voted: readonly string[] } | undefined> {
    const body = mineBodySchema.parse(request.body)
    if (body.slugs.length === 0) return { voted: [] }
    const ipHash = hashWithSalt(request.ip)
    // Rate-limit: probing vote state is cheap but still a data-disclosure
    // vector. Cap per IP so a scraper can't mass-enumerate.
    const decision = await app.limiter.check(
      `vote_mine:hour:${ipHash}`,
      effectiveLimit(MINE_LIMIT_PER_HOUR),
      HOUR_SECONDS,
    )
    if (!decision.allowed) {
      await reply
        .code(429)
        .send({ error: 'rate_limited', retry_after_seconds: decision.retryAfter })
      return undefined
    }
    const voted = await app.store.getVotedEntryIds(ipHash, body.kind, body.slugs)
    return { voted }
  }

  app.post<{ Params: { slug: string } }>(
    '/api/helped/posts/:slug/like',
    (req, reply) => handleToggle(req, reply, 'post'),
  )
  app.post<{ Params: { slug: string } }>(
    '/api/reports/:slug/dislike',
    (req, reply) => handleToggle(req, reply, 'report'),
  )
  app.post('/api/votes/mine', handleMine)
}
