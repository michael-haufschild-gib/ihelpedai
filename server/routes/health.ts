import type { FastifyInstance } from 'fastify'

/**
 * Health probe route. Cheap, dependency-free, suitable for liveness checks
 * behind the nginx reverse proxy. The `version` is sourced from the
 * `APP_VERSION` env (set by the deploy script); falls back to `'dev'` locally.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true,
    version: process.env.APP_VERSION ?? 'dev',
  }))
}
