// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Mailer, MailMessage } from '../mail/index.js'

/*
 * End-to-end happy path for admin onboarding:
 *
 *   admin (operator)             ↓ POST /api/admin/admins/invite
 *     │                          → server inserts admin + reset token
 *     │                          → mailer delivers message with token URL
 *     ↓ extract reset URL
 *   invitee                      ↓ POST /api/admin/reset-password { token, password }
 *     │                          → server verifies token, sets bcrypt hash, marks used
 *     ↓
 *   invitee                      ↓ POST /api/admin/login { email, password }
 *                                → 200 with new session cookie
 *
 * Each leg is independently tested elsewhere; this spec locks the full
 * round-trip so that an isolated change (e.g. the invite route emitting
 * a different URL shape) cannot pass its own spec while breaking the
 * downstream consumer's. End-to-end assertions catch contract drift
 * between modules that pure unit tests miss.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-invite-flow-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

class RecordingMailer implements Mailer {
  sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

let app: FastifyInstance
let mailer: RecordingMailer
let opsCookie = ''

const OPS_EMAIL = 'ops-inviter@admin.ai'
const OPS_PASSWORD = 'testpassword12'
const NEW_ADMIN_EMAIL = 'fresh-admin@admin.ai'
const NEW_ADMIN_PASSWORD = 'Tug-of-Squid! 87 lobotomy boats'

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  mailer = new RecordingMailer()
  ;(app as unknown as { mailer: Mailer }).mailer = mailer

  const hash = await bcrypt.hash(OPS_PASSWORD, 10)
  await app.store.insertAdmin(OPS_EMAIL, hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: OPS_EMAIL, password: OPS_PASSWORD },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  opsCookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(opsCookie).not.toBe('')
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('admin onboarding — invite → reset → login', () => {
  it('completes the full flow end-to-end with the cookie issued by login', async () => {
    // Step 1: ops invites the new admin.
    mailer.sent = []
    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/admins/invite',
      headers: { cookie: opsCookie },
      payload: { email: NEW_ADMIN_EMAIL },
    })
    expect(invite.statusCode).toBe(201)

    // The invite must have produced exactly one mail message addressed
    // to the new admin, containing a reset URL with a token query param.
    expect(mailer.sent).toHaveLength(1)
    const sent = mailer.sent[0]
    if (sent === undefined) throw new Error('expected invite email')
    expect(sent.to).toBe(NEW_ADMIN_EMAIL)
    const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(sent.text)
    expect(tokenMatch).not.toBe(null)
    const token = tokenMatch?.[1]
    if (token === undefined) throw new Error('expected token query param in invite')

    // Step 2: invitee uses the token to set their password.
    const reset = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: {
        token,
        password: NEW_ADMIN_PASSWORD,
        confirm_password: NEW_ADMIN_PASSWORD,
      },
    })
    expect(reset.statusCode).toBe(200)

    // Step 3: invitee logs in with the new password. Cookie must
    // authenticate the /api/admin/me probe — that's the round-trip lock.
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: NEW_ADMIN_EMAIL, password: NEW_ADMIN_PASSWORD },
      headers: { 'x-forwarded-for': '203.0.113.45' },
    })
    expect(login.statusCode).toBe(200)
    const loginRaw = login.headers['set-cookie']
    const newCookie = typeof loginRaw === 'string' ? loginRaw : ((loginRaw as string[])[0] ?? '')
    expect(newCookie).not.toBe('')

    const me = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: newCookie },
    })
    expect(me.statusCode).toBe(200)
    expect((me.json() as { email: string }).email).toBe(NEW_ADMIN_EMAIL)

    // Step 4: the same token cannot be reused (used=true after reset).
    // Locks the one-shot semantics across the full flow.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: {
        token,
        password: NEW_ADMIN_PASSWORD,
        confirm_password: NEW_ADMIN_PASSWORD,
      },
    })
    expect(replay.statusCode).toBe(400)
  })

  it('a partially-completed invite (mail succeeds, reset never used) leaves the admin row in active+blocked state', async () => {
    // The route inserts the admin row as 'active' regardless of whether
    // the invitee ever resets. That's deliberate: revoking would force a
    // re-invite. But until the password is set the admin has NO usable
    // password (the route inserts a placeholder bcrypt hash). A login
    // attempt must therefore 401, not silently succeed.
    mailer.sent = []
    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/admins/invite',
      headers: { cookie: opsCookie },
      payload: { email: 'unused-invite@admin.ai' },
    })
    expect(invite.statusCode).toBe(201)
    expect(mailer.sent).toHaveLength(1)

    // Login attempt with any password must fail. There is no plaintext
    // for the placeholder hash, so the bcrypt comparison cannot match.
    const failed = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: {
        email: 'unused-invite@admin.ai',
        password: NEW_ADMIN_PASSWORD,
      },
      headers: { 'x-forwarded-for': '203.0.113.46' },
    })
    expect(failed.statusCode).toBe(401)
    expect((failed.json() as { message: string }).message).toBe('Email or password is incorrect.')

    // The admin row exists, status=active, last_login_at unset.
    const row = await app.store.getAdminByEmail('unused-invite@admin.ai')
    expect(row?.status).toBe('active')
    expect(row?.lastLoginAt).toBe(null)
  })
})
