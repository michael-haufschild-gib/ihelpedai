import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

import { config, parseAdminSessionSecrets } from './config.js'
import { registerDeps } from './deps.js'
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
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true } },
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

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {}
      for (const [key, messages] of Object.entries(error.flatten().fieldErrors)) {
        if (Array.isArray(messages) && messages.length > 0) fields[key] = messages[0]
      }
      reply.status(400).send({ error: 'invalid_input', fields })
      return
    }
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed')
    } else {
      request.log.warn({ err: error }, 'client error')
    }
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'internal_error' : error.message,
    })
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
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
