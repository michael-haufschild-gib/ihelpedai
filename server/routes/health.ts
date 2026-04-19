import type { FastifyInstance } from 'fastify'

/**
 * Health probe route. Cheap, dependency-free, suitable for liveness checks
 * behind the nginx reverse proxy.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, version: 'dev' }))
}
