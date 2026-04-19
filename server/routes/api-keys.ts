import { createHash, randomBytes } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import { FileMailer } from '../mail/file-mailer.js'
import type { Mailer } from '../mail/index.js'
import { MemoryRateLimiter } from '../rate-limit/memory-limiter.js'
import type { Store } from '../store/index.js'
import { SqliteStore } from '../store/sqlite-store.js'

const issueSchema = z.object({
  email: z.string().email().max(200),
})

let storeSingleton: Store | null = null
let limiterSingleton: MemoryRateLimiter | null = null
let mailerSingleton: Mailer | null = null

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

/** Lazy-initialized mailer. Uses file mailer in dev; SMTP path would be similar. */
function getMailer(): Mailer {
  if (mailerSingleton === null) mailerSingleton = new FileMailer(config.MAIL_FROM)
  return mailerSingleton
}

/** Hash a value with sha256 using the server-side salt. */
function hashWithSalt(value: string): string {
  return createHash('sha256').update(`${config.IP_HASH_SALT}:${value}`).digest('hex')
}

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

/** Handle POST /api/api-keys/issue — validates, rate-limits, issues a key by email. */
async function handleIssue(body: unknown, reply: ReplyShape): Promise<void> {
  const parsed = issueSchema.parse(body)
  const emailHash = hashWithSalt(parsed.email.toLowerCase())
  const limiter = getLimiter()
  const decision = await limiter.check(`api_key_issue:${emailHash}`, 3, 24 * 3600)
  if (!decision.allowed) {
    reply
      .status(429)
      .send({ error: 'rate_limited', retry_after_seconds: decision.retryAfter })
    return
  }
  const apiKey = generateApiKey()
  const keyHash = hashWithSalt(apiKey)
  await getStore().insertApiKey({ keyHash, emailHash, status: 'active' })
  await getMailer().send({
    to: parsed.email,
    subject: 'Your ihelped.ai API key',
    text: buildMailBody(apiKey),
  })
  reply.status(200).send({ status: 'sent' })
}

/**
 * Routes for API key self-service issuance (PRD 01 Story 7).
 * Registers:
 *   POST /api/api-keys/issue   — send a new API key by email
 */
export async function apiKeysRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/api-keys/issue', async (request, reply) => {
    await handleIssue(request.body, reply)
  })
}
