import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

import { config } from './config.js'
import { registerRoutes } from './routes/index.js'

/**
 * Fastify application factory. Exported for tests (which inject requests
 * directly) and for the server entrypoint at the bottom of this file.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Trust nginx/X-Forwarded-For so `request.ip` is the real client address.
    // Without this, votes and rate-limits collapse to the proxy IP in prod.
    trustProxy: true,
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true } },
    },
  })

  await app.register(cookie, { secret: config.ADMIN_SESSION_SECRET })
  await app.register(cors, {
    origin: [config.PUBLIC_URL],
    credentials: true,
  })

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: 'invalid_input',
        fields: error.flatten().fieldErrors,
      })
      return
    }
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500
    request.log.error({ err: error }, 'request failed')
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
  const thisFile = new URL(import.meta.url).pathname
  return thisFile.endsWith('/server/index.ts') || thisFile.endsWith('/server/index.js')
    ? invoked.endsWith('index.ts') || invoked.endsWith('index.js')
    : false
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
