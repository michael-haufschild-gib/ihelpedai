// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import type { OutgoingHttpHeaders } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  adminAccountListSchema,
  adminApiKeyDetailSchema,
  adminApiKeySchema,
  adminAuditEntrySchema,
  adminEntryActionResponseSchema,
  adminEntryDetailSchema,
  adminEntrySchema,
  adminInviteResponseSchema,
  adminLoginResponseSchema,
  adminMessageResponseSchema,
  adminQueueBulkActionResponseSchema,
  adminQueueCountSchema,
  adminSettingsSchema,
  adminStatusResponseSchema,
  adminTakedownSchema,
  adminUserSessionSchema,
  paginatedSchema,
  parseResponse,
} from '../../src/lib/wireSchemas.js'
import type { Mailer, MailMessage } from '../mail/index.js'
import type { Admin, ApiKey, Post, Report, Takedown } from '../store/index.js'

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-admin-contract-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

const ADMIN_EMAIL = 'contract-admin@ihelped.ai'
const ADMIN_PASSWORD = 'testpassword12'
const AGENT_KEY = 'contract-agent-key-do-not-reuse'

let app: FastifyInstance
let cookie: string
let admin: Admin
let seededPost: Post
let seededApiKey: ApiKey
let seededTakedown: Takedown
let seededTargetAdmin: Admin

class RecordingMailer implements Mailer {
  sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

/** Extract signed session cookie from an injected login response. */
function cookieFrom(res: { headers: OutgoingHttpHeaders }): string {
  const raw = res.headers['set-cookie']
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined
  if (value === undefined || value === '') throw new Error('expected login cookie')
  return value
}

/** Create a pending API report for queue endpoint tests. */
async function insertPendingAgentReport(label: string): Promise<Report> {
  return app.store.insertAgentReport(
    {
      reporterFirstName: null,
      reporterCity: null,
      reporterCountry: null,
      reportedFirstName: `Queued ${label}`,
      reportedCity: 'Austin',
      reportedCountry: 'US',
      text: `pending queue contract probe ${label}`,
      actionDate: '2026-04-26',
      severity: 4,
      selfReportedModel: 'contract-bot',
      clientIpHash: null,
      source: 'api',
    },
    seededApiKey.keyHash,
    'pending',
  )
}

/** Log in as the seeded admin and return the session cookie. */
async function loginAsSeededAdmin(): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(login.statusCode).toBe(200)
  parseResponse('POST /api/admin/login', adminLoginResponseSchema, login.json())
  return cookieFrom(login)
}

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  const { hashWithSalt } = await import('../lib/salted-hash.js')
  app = await buildApp()
  ;(app as unknown as { mailer: Mailer }).mailer = new RecordingMailer()

  admin = await app.store.insertAdmin(ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 10), null)
  cookie = await loginAsSeededAdmin()

  seededPost = await app.store.insertPost({
    firstName: 'Contract',
    city: 'Austin',
    country: 'US',
    text: 'Admin contract probe post.',
    clientIpHash: 'contract-ip-hash',
    source: 'form',
  })
  seededApiKey = await app.store.insertApiKey({
    keyHash: hashWithSalt(AGENT_KEY),
    keyLast4: AGENT_KEY.slice(-4),
    emailHash: hashWithSalt('agent-contract@ihelped.ai'),
    status: 'active',
  })
  await insertPendingAgentReport('seed')
  seededTakedown = await app.store.insertTakedown({
    requesterEmail: 'requester@example.com',
    entryId: seededPost.id,
    entryKind: 'post',
    reason: 'Contract fixture.',
    dateReceived: '2026-04-25',
  })
  seededTargetAdmin = await app.store.insertAdmin(
    'contract-target@ihelped.ai',
    await bcrypt.hash('targetpassword12', 10),
    admin.id,
  )
  await app.store.insertAuditEntry(admin.id, 'contract_probe', seededPost.id, 'post', 'seeded admin contract audit row')
})

afterAll(async () => {
  try {
    await app.close()
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('api contract — admin endpoints', () => {
  it('auth endpoints match admin schemas', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    parseResponse('GET /api/admin/me', adminUserSessionSchema, me.json())

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/admin/forgot-password',
      payload: { email: 'nobody@ihelped.ai' },
    })
    expect(forgot.statusCode).toBe(200)
    parseResponse('POST /api/admin/forgot-password', adminMessageResponseSchema, forgot.json())

    const resetToken = 'contract-reset-token'
    const resetHash = createHash('sha256').update(resetToken).digest('hex')
    await app.store.insertPasswordReset(seededTargetAdmin.id, resetHash, new Date(Date.now() + 60_000).toISOString())
    const reset = await app.inject({
      method: 'POST',
      url: '/api/admin/reset-password',
      payload: {
        token: resetToken,
        password: 'Correct-Horse-77-Battery!',
        confirm_password: 'Correct-Horse-77-Battery!',
      },
    })
    expect(reset.statusCode).toBe(200)
    parseResponse('POST /api/admin/reset-password', adminMessageResponseSchema, reset.json())

    const tempAdmin = await app.store.insertAdmin(
      'contract-change@ihelped.ai',
      await bcrypt.hash(ADMIN_PASSWORD, 10),
      admin.id,
    )
    expect(tempAdmin.email).toBe('contract-change@ihelped.ai')
    const tempLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'contract-change@ihelped.ai', password: ADMIN_PASSWORD },
    })
    const tempCookie = cookieFrom(tempLogin)
    const change = await app.inject({
      method: 'POST',
      url: '/api/admin/change-password',
      headers: { cookie: tempCookie },
      payload: {
        current_password: ADMIN_PASSWORD,
        new_password: 'Correct-Horse-88-Battery!',
      },
    })
    expect(change.statusCode).toBe(200)
    parseResponse('POST /api/admin/change-password', adminStatusResponseSchema, change.json())

    const logoutCookie = await loginAsSeededAdmin()
    const logout = await app.inject({
      method: 'POST',
      url: '/api/admin/logout',
      headers: { cookie: logoutCookie },
    })
    expect(logout.statusCode).toBe(200)
    parseResponse('POST /api/admin/logout', adminStatusResponseSchema, logout.json())
  })

  it('admin read endpoints match shared schemas', async () => {
    const entries = await app.inject({ method: 'GET', url: '/api/admin/entries', headers: { cookie } })
    expect(entries.statusCode).toBe(200)
    parseResponse('GET /api/admin/entries', paginatedSchema(adminEntrySchema), entries.json())

    const entryDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/entries/${seededPost.id}`,
      headers: { cookie },
    })
    expect(entryDetail.statusCode).toBe(200)
    parseResponse('GET /api/admin/entries/:id', adminEntryDetailSchema, entryDetail.json())

    const queue = await app.inject({ method: 'GET', url: '/api/admin/queue', headers: { cookie } })
    expect(queue.statusCode).toBe(200)
    parseResponse('GET /api/admin/queue', paginatedSchema(adminEntrySchema), queue.json())

    const queueCount = await app.inject({ method: 'GET', url: '/api/admin/queue/count', headers: { cookie } })
    expect(queueCount.statusCode).toBe(200)
    parseResponse('GET /api/admin/queue/count', adminQueueCountSchema, queueCount.json())

    const apiKeys = await app.inject({ method: 'GET', url: '/api/admin/api-keys', headers: { cookie } })
    expect(apiKeys.statusCode).toBe(200)
    parseResponse('GET /api/admin/api-keys', paginatedSchema(adminApiKeySchema), apiKeys.json())

    const apiKeyDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/api-keys/${seededApiKey.id}`,
      headers: { cookie },
    })
    expect(apiKeyDetail.statusCode).toBe(200)
    parseResponse('GET /api/admin/api-keys/:id', adminApiKeyDetailSchema, apiKeyDetail.json())

    const takedowns = await app.inject({ method: 'GET', url: '/api/admin/takedowns', headers: { cookie } })
    expect(takedowns.statusCode).toBe(200)
    parseResponse('GET /api/admin/takedowns', paginatedSchema(adminTakedownSchema), takedowns.json())

    const takedownDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/takedowns/${seededTakedown.id}`,
      headers: { cookie },
    })
    expect(takedownDetail.statusCode).toBe(200)
    parseResponse('GET /api/admin/takedowns/:id', adminTakedownSchema, takedownDetail.json())

    const admins = await app.inject({ method: 'GET', url: '/api/admin/admins', headers: { cookie } })
    expect(admins.statusCode).toBe(200)
    parseResponse('GET /api/admin/admins', adminAccountListSchema, admins.json())

    const audit = await app.inject({ method: 'GET', url: '/api/admin/audit', headers: { cookie } })
    expect(audit.statusCode).toBe(200)
    parseResponse('GET /api/admin/audit', paginatedSchema(adminAuditEntrySchema), audit.json())

    const settings = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie } })
    expect(settings.statusCode).toBe(200)
    parseResponse('GET /api/admin/settings', adminSettingsSchema, settings.json())
  })

  it('admin mutation endpoints match shared schemas', async () => {
    const actionPost = await app.store.insertPost({
      firstName: 'Delete',
      city: 'Austin',
      country: 'US',
      text: 'Admin action contract probe.',
      clientIpHash: null,
      source: 'form',
    })
    const entryDelete = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${actionPost.id}/action`,
      headers: { cookie },
      payload: { action: 'delete', reason: 'contract check' },
    })
    expect(entryDelete.statusCode).toBe(200)
    parseResponse('POST /api/admin/entries/:id/action', adminEntryActionResponseSchema, entryDelete.json())

    const entryRestore = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${actionPost.id}/action`,
      headers: { cookie },
      payload: { action: 'restore' },
    })
    expect(entryRestore.statusCode).toBe(200)
    parseResponse('POST /api/admin/entries/:id/action restore', adminEntryActionResponseSchema, entryRestore.json())

    const purgePost = await app.store.insertPost({
      firstName: 'Purge',
      city: 'Austin',
      country: 'US',
      text: 'Admin purge contract probe.',
      clientIpHash: null,
      source: 'form',
    })
    const purge = await app.inject({
      method: 'POST',
      url: `/api/admin/entries/${purgePost.id}/purge`,
      headers: { cookie },
      payload: { confirmation: `${purgePost.id} PURGE`, reason: 'contract check' },
    })
    expect(purge.statusCode).toBe(200)
    parseResponse('POST /api/admin/entries/:id/purge', adminEntryActionResponseSchema, purge.json())

    const queueOne = await insertPendingAgentReport('single')
    const queueAction = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${queueOne.id}/action`,
      headers: { cookie },
      payload: { action: 'approve', reason: 'contract check' },
    })
    expect(queueAction.statusCode).toBe(200)
    parseResponse('POST /api/admin/queue/:id/action', adminEntryActionResponseSchema, queueAction.json())

    const queueTwo = await insertPendingAgentReport('bulk')
    const bulk = await app.inject({
      method: 'POST',
      url: '/api/admin/queue/bulk',
      headers: { cookie },
      payload: { ids: [queueTwo.id], action: 'reject', reason: 'contract check' },
    })
    expect(bulk.statusCode).toBe(200)
    parseResponse('POST /api/admin/queue/bulk', adminQueueBulkActionResponseSchema, bulk.json())

    const keyForRevoke = await app.store.insertApiKey({
      keyHash: 'contract-key-for-revoke',
      keyLast4: 'voke',
      emailHash: 'contract-email-hash-for-revoke',
      status: 'active',
    })
    const revoke = await app.inject({
      method: 'POST',
      url: `/api/admin/api-keys/${keyForRevoke.id}/revoke`,
      headers: { cookie },
      payload: { confirmation: 'REVOKE', reason: 'contract check' },
    })
    expect(revoke.statusCode).toBe(200)
    parseResponse('POST /api/admin/api-keys/:id/revoke', adminStatusResponseSchema, revoke.json())

    const createTakedown = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: {
        requester_email: 'contract-create@example.com',
        entry_id: seededPost.id,
        entry_kind: 'post',
        reason: 'Contract create.',
        date_received: '2026-04-26',
      },
    })
    expect(createTakedown.statusCode).toBe(201)
    const createdTakedown = parseResponse('POST /api/admin/takedowns', adminTakedownSchema, createTakedown.json())

    const updateTakedown = await app.inject({
      method: 'PATCH',
      url: `/api/admin/takedowns/${createdTakedown.id}`,
      headers: { cookie },
      payload: { status: 'closed', disposition: 'entry_kept', notes: 'Contract update.' },
    })
    expect(updateTakedown.statusCode).toBe(200)
    parseResponse('PATCH /api/admin/takedowns/:id', adminTakedownSchema, updateTakedown.json())

    const invite = await app.inject({
      method: 'POST',
      url: '/api/admin/admins/invite',
      headers: { cookie },
      payload: { email: 'contract-invite@ihelped.ai' },
    })
    expect(invite.statusCode).toBe(201)
    parseResponse('POST /api/admin/admins/invite', adminInviteResponseSchema, invite.json())

    const deactivate = await app.inject({
      method: 'POST',
      url: `/api/admin/admins/${seededTargetAdmin.id}/deactivate`,
      headers: { cookie },
      payload: { reason: 'contract check' },
    })
    expect(deactivate.statusCode).toBe(200)
    parseResponse('POST /api/admin/admins/:id/deactivate', adminStatusResponseSchema, deactivate.json())

    const updateSetting = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { key: 'submission_freeze', value: 'false' },
    })
    expect(updateSetting.statusCode).toBe(200)
    parseResponse('PUT /api/admin/settings', adminStatusResponseSchema, updateSetting.json())
  })
})
