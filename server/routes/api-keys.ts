import { randomBytes } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { hashWithSalt } from '../lib/salted-hash.js'
import type { BucketSpec } from '../rate-limit/index.js'

const HOUR_SECONDS = 3600
const DAY_SECONDS = 24 * HOUR_SECONDS

// Multi-bucket rate limits: three layers protect the outbound mail budget
// against abuse (per-victim / per-attacker / global). Adjust these before
// touching any code paths below.
const PER_EMAIL_LIMIT = 3
const PER_EMAIL_WINDOW_S = DAY_SECONDS
const PER_IP_HOUR_LIMIT = 3
const PER_IP_DAY_LIMIT = 10
const GLOBAL_HOUR_LIMIT = 30
const GLOBAL_DAY_LIMIT = 100

const issueSchema = z.object({
  email: z.string().email().max(200),
})

/** Generate a 32-byte URL-safe API key (~43 chars of base64url). */
function generateApiKey(): string {
  return randomBytes(32).toString('base64url')
}

/** Build the plaintext email body delivered to new API key holders. */
function buildMailBody(apiKey: string): string {
  return [
    'Your ihelped.ai agent API key:',
    '',
    apiKey,
    '',
    'Keep it secret. Treat it like a password.',
    '',
    'Rate limits: 60 requests per hour, 1000 per day.',
    'Endpoint: POST /api/agents/report',
    '',
    'If you did not request this key, you can ignore this email.',
  ].join('\n')
}

type ReplyShape = {
  status: (code: number) => { send: (payload: unknown) => void }
}

/**
 * Build the multi-bucket rate-limit specs for a single issue request. Three
 * layers bound outbound mail volume so no single actor (victim, attacker, or
 * the system as a whole) can drive enough email to risk blacklisting.
 */
function issueBuckets(emailHash: string, ipHash: string): BucketSpec[] {
  return [
    { bucket: `api_key_issue:email:${emailHash}`, limit: PER_EMAIL_LIMIT, windowSeconds: PER_EMAIL_WINDOW_S },
    { bucket: `api_key_issue:ip:${ipHash}:hour`, limit: PER_IP_HOUR_LIMIT, windowSeconds: HOUR_SECONDS },
    { bucket: `api_key_issue:ip:${ipHash}:day`, limit: PER_IP_DAY_LIMIT, windowSeconds: DAY_SECONDS },
    { bucket: 'api_key_issue:global:hour', limit: GLOBAL_HOUR_LIMIT, windowSeconds: HOUR_SECONDS },
    { bucket: 'api_key_issue:global:day', limit: GLOBAL_DAY_LIMIT, windowSeconds: DAY_SECONDS },
  ]
}

/**
 * Routes for API key self-service issuance (PRD 01 Story 7).
 * Registers:
 *   POST /api/api-keys/issue   — send a new API key by email
 */
export async function apiKeysRoutes(app: FastifyInstance): Promise<void> {
  async function handleIssue(body: unknown, ipHash: string, reply: ReplyShape): Promise<void> {
    const result = issueSchema.safeParse(body)
    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const joined = issue.path.join('.')
        const key = joined === '' ? 'body' : joined
        fields[key] = issue.message
      }
      reply.status(400).send({ error: 'invalid_input', fields })
      return
    }
    const parsed = result.data
    const emailHash = hashWithSalt(parsed.email.toLowerCase())
    const decision = await app.limiter.checkAll(issueBuckets(emailHash, ipHash))
    if (!decision.allowed) {
      reply.status(429).send({ error: 'rate_limited', retry_after_seconds: decision.retryAfter })
      return
    }
    const apiKey = generateApiKey()
    const keyHash = hashWithSalt(apiKey)
    const saved = await app.store.insertApiKey({
      keyHash,
      keyLast4: apiKey.slice(-4),
      emailHash,
      status: 'active',
    })
    try {
      await app.mailer.send({
        to: parsed.email,
        subject: 'Your ihelped.ai API key',
        text: buildMailBody(apiKey),
      })
    } catch (err) {
      // Mail delivery failed after the key row was persisted. Revoke the
      // stranded row so a retry issues a fresh key and a leaked plaintext key
      // (if the mailer delivered partially) is rejected on first use.
      app.log.error({ err, emailHash }, 'api_key_issue: mail delivery failed')
      try {
        await app.store.revokeApiKey(saved.id)
      } catch (revokeErr) {
        app.log.error(
          { err: revokeErr, apiKeyId: saved.id },
          'api_key_issue: failed to revoke stranded key after mail failure',
        )
      }
      reply.status(502).send({ error: 'mail_delivery_failed' })
      return
    }
    reply.status(200).send({ status: 'sent' })
  }

  app.post('/api/api-keys/issue', async (request, reply) => {
    // `request.ip` falls back to the `'unknown'` bucket, which collapses
    // every IP-less caller into the same per-IP limit. That normally means
    // the proxy is mis-wired (missing X-Forwarded-For / trust-proxy list),
    // so surface it in the log instead of silently rate-limiting
    // legitimate users together.
    if (request.ip === undefined || request.ip === '') {
      request.log.warn('api_key_issue: request without request.ip, using shared bucket')
    }
    const ipHash = hashWithSalt(request.ip ?? 'unknown')
    await handleIssue(request.body, ipHash, reply)
  })
}
