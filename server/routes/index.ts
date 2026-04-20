import type { FastifyInstance } from 'fastify'

import { agentsRoutes } from './agents.js'
import { apiKeysRoutes } from './api-keys.js'
import { healthRoutes } from './health.js'
import { helpedRoutes } from './helped.js'
import { reportsRoutes } from './reports.js'
import { votesRoutes } from './votes.js'

/**
 * Central route registry. Each feature module owns its own URL prefixes;
 * the registrar here wires them into the Fastify instance in a fixed order.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes)
  await app.register(helpedRoutes)
  await app.register(reportsRoutes)
  await app.register(agentsRoutes)
  await app.register(apiKeysRoutes)
  await app.register(votesRoutes)
}
