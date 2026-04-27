import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

import { config, parseAdminSessionSecrets } from './config.js'
import { registerDeps } from './deps.js'
import { zodFieldErrors } from './lib/zod-field-errors.js'
import { registerRoutes } from './routes/index.js'

/**
 * Fastify application factory. Exported for tests (which inject requests
 * directly) and for the server entrypoint at the bottom of this file.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Trust X-Forwarded-For only when the immediate peer is loopback — i.e.
    // nginx running on the same host. `trustProxy: true` would honour the
    // header from any source, letting any inbound request fabricate its own
    // client IP and defeat the per-IP rate limit + vote dedupe. Loopback IPv4
    // and IPv6 are listed because nginx may forward over either depending on
    // upstream block configuration. Tests using `app.inject` default to
    // `127.0.0.1` as the simulated peer so this remains compatible.
    trustProxy: ['127.0.0.1', '::1'],
    logger:
      process.env.VITEST === 'true' || config.NODE_ENV === 'test'
        ? false
        : {
            level: config.NODE_ENV === 'production' ? 'info' : 'debug',
            transport:
              config.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { colorize: true } },
          },
  })

  // @fastify/cookie accepts a string or string[]. With an array, the first
  // entry signs new cookies and any entry verifies existing ones — that is
  // the rotation primitive. ADMIN_SESSION_SECRET parses comma-separated so a
  // deploy can prepend a new secret while old sessions are still valid, then
  // drop the previous secret on a later deploy without invalidating anyone.
  const sessionSecrets = parseAdminSessionSecrets(config.ADMIN_SESSION_SECRET)
  await app.register(cookie, { secret: sessionSecrets })
  await app.register(cors, {
    origin: [config.PUBLIC_URL],
    credentials: true,
  })

  registerDeps(app)

  // Map an HTTP status to our public error-envelope kind enum. Keeps Fastify
  // framework errors (body-too-large, unsupported media type, plugin errors,
  // etc.) from leaking raw `error.message` strings into the `error` field.
  const statusToErrorKind = (status: number): string => {
    if (status === 429) return 'rate_limited'
    if (status === 401 || status === 403) return 'unauthorized'
    if (status === 404) return 'not_found'
    if (status >= 500) return 'internal_error'
    return 'invalid_input'
  }

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({ error: 'invalid_input', fields: zodFieldErrors(error) })
      return
    }
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed')
    } else {
      request.log.warn({ err: error }, 'client error')
    }
    // Emit the enum `error` + optional non-sensitive `message` so clients can
    // still display context (e.g. "Body too large") while the contract-level
    // kind remains stable. Server-side 5xx details are withheld.
    const body: { error: string; message?: string } = { error: statusToErrorKind(statusCode) }
    if (statusCode < 500 && typeof error.message === 'string' && error.message !== '') {
      body.message = error.message
    }
    reply.status(statusCode).send(body)
  })

  // Custom 404 handler — Fastify's default envelope is
  // `{ statusCode, error: "Not Found", message }` which doesn't match the
  // PRD error contract. Align with route-level 404 emitters that already
  // send `{ error: "not_found" }`.
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'not_found' })
  })

  await registerRoutes(app)
  return app
}

const isEntrypoint = (): boolean => {
  const invoked = process.argv[1]
  if (invoked === undefined) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invoked)
  } catch {
    return false
  }
}

if (isEntrypoint()) {
  const app = await buildApp()
  try {
    await app.listen({ port: config.PORT, host: config.BIND_HOST })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
