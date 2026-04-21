import type { FastifyInstance } from 'fastify'

import { adminAccountRoutes } from './accounts.js'
import { adminApiKeyRoutes } from './api-keys.js'
import { adminAuditRoutes } from './audit.js'
import { adminAuthRoutes, adminPasswordRoutes } from './auth.js'
import { adminEntryActionRoutes, adminEntryRoutes } from './entries.js'
import { adminQueueRoutes } from './queue.js'
import { adminSettingsRoutes } from './settings.js'
import { adminTakedownRoutes } from './takedowns.js'

/**
 * Register all admin backoffice routes (PRD 02). Auth routes are public
 * (login, forgot-password); all others require a valid admin session.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(adminAuthRoutes)
  await app.register(adminPasswordRoutes)
  await app.register(adminEntryRoutes)
  await app.register(adminEntryActionRoutes)
  await app.register(adminQueueRoutes)
  await app.register(adminApiKeyRoutes)
  await app.register(adminTakedownRoutes)
  await app.register(adminAccountRoutes)
  await app.register(adminAuditRoutes)
  await app.register(adminSettingsRoutes)
}
