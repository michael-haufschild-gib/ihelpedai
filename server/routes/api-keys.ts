import { createHash, randomBytes } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'

const issueSchema = z.object({
  email: z.string().email().max(200),
})

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

/**
 * Routes for API key self-service issuance (PRD 01 Story 7).
 * Registers:
 *   POST /api/api-keys/issue   — send a new API key by email
 */
export async function apiKeysRoutes(app: FastifyInstance): Promise<void> {
  async function handleIssue(body: unknown, reply: ReplyShape): Promise<void> {
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
    const decision = await app.limiter.check(`api_key_issue:${emailHash}`, 3, 24 * 3600)
    if (!decision.allowed) {
      reply
        .status(429)
        .send({ error: 'rate_limited', retry_after_seconds: decision.retryAfter })
      return
    }
    const apiKey = generateApiKey()
    const keyHash = hashWithSalt(apiKey)
    const saved = await app.store.insertApiKey({ keyHash, emailHash, status: 'active' })
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
    await handleIssue(request.body, reply)
  })
}
