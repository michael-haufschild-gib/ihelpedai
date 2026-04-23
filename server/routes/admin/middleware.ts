import type { FastifyReply, FastifyRequest } from 'fastify'

import type { Admin } from '../../store/index.js'

const SESSION_COOKIE = 'admin_session'
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000
// Hard ceiling on total session lifetime regardless of how actively the
// cookie is used. `touchSession` slides the idle window forward on every
// request; without this cap, a stolen cookie that stays active would be
// valid forever. 30 days matches common backoffice conventions (long enough
// that real admins are not re-logging weekly, short enough that a
// compromised long-lived session is eventually invalidated).
const SESSION_ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000

declare module 'fastify' {
  interface FastifyRequest {
    admin?: Admin
  }
}

/** Compute an ISO expiry string 14 days from now. */
export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_DURATION_MS).toISOString()
}

/** Cookie name for admin sessions. */
export { SESSION_COOKIE }

/**
 * Fastify preHandler that validates the admin session cookie.
 * Sets `request.admin` on success; replies 401 on failure.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = request.cookies[SESSION_COOKIE]
  if (typeof raw !== 'string' || raw === '') {
    reply.status(401).send({ error: 'unauthorized' })
    return
  }

  const unsigned = request.unsignCookie(raw)
  if (!unsigned.valid || typeof unsigned.value !== 'string' || unsigned.value === '') {
    reply.status(401).send({ error: 'unauthorized' })
    return
  }

  const session = await request.server.store.getSession(unsigned.value)
  if (session === null) {
    reply.status(401).send({ error: 'unauthorized' })
    return
  }

  // Absolute age cap: regardless of recent activity, a session older than
  // SESSION_ABSOLUTE_MAX_MS must re-authenticate. Parsing to a Date handles
  // both the ISO-8601 SQLite format and the ISO-8601 MySQL serialization.
  const sessionAgeMs = Date.now() - new Date(session.createdAt).getTime()
  if (sessionAgeMs > SESSION_ABSOLUTE_MAX_MS) {
    await request.server.store.deleteSession(session.id)
    reply.status(401).send({ error: 'unauthorized' })
    return
  }

  const admin = await request.server.store.getAdmin(session.adminId)
  if (admin === null || admin.status !== 'active') {
    await request.server.store.deleteSession(session.id)
    reply.status(401).send({ error: 'unauthorized' })
    return
  }

  await request.server.store.touchSession(session.id, sessionExpiry())
  request.admin = admin
}
