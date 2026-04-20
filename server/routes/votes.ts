import { createHash } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
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
const HOUR_SECONDS = 60 * 60
const SLUG_RE = /^[A-Za-z0-9]{1,32}$/
const MAX_MINE_SLUGS = 50

const hashIp = (ip: string): string =>
  createHash('sha256').update(`${config.IP_HASH_SALT}:${ip}`).digest('hex')

const effectiveLimit = (base: number): number =>
  config.NODE_ENV === 'production'
    ? base
    : Math.max(1, Math.floor(base * config.DEV_RATE_MULTIPLIER))

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
    const ipHash = hashIp(request.ip)
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
  ): Promise<{ voted: readonly string[] }> {
    const body = mineBodySchema.parse(request.body)
    if (body.slugs.length === 0) return { voted: [] }
    const ipHash = hashIp(request.ip)
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
