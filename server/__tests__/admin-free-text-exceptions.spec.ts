// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Behavioural lock for the admin-free-text → sanitizer integration.
 *
 * sanitizer-exceptions-admin.spec covers user-post text. This spec
 * locks the admin-side path: takedown reasons, takedown notes, queue
 * action reasons, and entry-action reasons all flow through
 * sanitizeAdminFreeText, which reads the live `sanitizer_exceptions`
 * setting on every call.
 *
 * Why this matters: an admin setting an exception for "Ada Lovelace"
 * expects the term to survive in BOTH user posts AND admin notes.
 * A regression that read the setting only on user paths (and not on
 * admin paths) would silently corrupt admin notes — turning a
 * "Ada Lovelace claimed harassment" reason into "[name] claimed
 * harassment" — breaking the audit trail at exactly the worst
 * possible moment.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-admin-text-exc-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

let app: FastifyInstance
let cookie = ''

beforeAll(async () => {
  const { buildApp } = await import('../index.js')
  app = await buildApp()
  const hash = await bcrypt.hash('testpassword12', 10)
  await app.store.insertAdmin('exc-ops@admin.ai', hash, null)
  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { email: 'exc-ops@admin.ai', password: 'testpassword12' },
  })
  expect(login.statusCode).toBe(200)
  const raw = login.headers['set-cookie']
  cookie = typeof raw === 'string' ? raw : ((raw as string[])[0] ?? '')
  expect(cookie).not.toBe('')

  // Plant the exception. All subsequent admin-text writes should honor it.
  await app.store.setSetting('sanitizer_exceptions', 'Ada Lovelace')
})

afterAll(async () => {
  await app.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('admin sanitizer_exceptions → admin free-text fields', () => {
  it('takedown reason preserves an admin-listed phrase that the base rule would redact', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: {
        reason: 'Ada Lovelace requested removal of a misattribution.',
        date_received: '2026-04-23',
      },
    })
    expect(create.statusCode).toBe(201)
    const created = create.json() as { id: string; reason: string }
    // Without the exception list, "Ada Lovelace" would have been
    // redacted to "[name]". With it, the phrase is preserved verbatim.
    expect(created.reason).toContain('Ada Lovelace')
  })

  it('takedown notes (PATCH) preserve an admin-listed phrase', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: { reason: 'Notes path probe.', date_received: '2026-04-23' },
    })
    expect(create.statusCode).toBe(201)
    const { id } = create.json() as { id: string }

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/takedowns/${id}`,
      headers: { cookie },
      payload: { notes: 'Followed up with Ada Lovelace via email.' },
    })
    expect(patch.statusCode).toBe(200)
    expect((patch.json() as { notes: string }).notes).toContain('Ada Lovelace')
  })

  it('a phrase NOT in the exception list still gets redacted in admin free-text', async () => {
    // Counterpart: locks that the exception list narrows the redaction
    // for SPECIFIED phrases only, not a blanket bypass. A regression
    // that disabled sanitization entirely on admin paths (e.g. wired
    // raw input straight into the store) would pass the positive tests
    // above but break this one.
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: {
        reason: 'Sam Altman emailed leaks@example.com about it.',
        date_received: '2026-04-23',
      },
    })
    expect(create.statusCode).toBe(201)
    const { reason } = create.json() as { reason: string }
    // The two-cap-words rule still fires for "Sam Altman" because it's
    // not on the exception list. The email also redacts.
    expect(reason).toContain('[name]')
    expect(reason).toContain('[email]')
    expect(reason).not.toContain('Sam Altman')
    expect(reason).not.toContain('leaks@example.com')
  })

  it('a queue action reason honors the admin exception list (audit detail path)', async () => {
    // Plant an api-source pending report so we have something to queue-act on.
    await app.store.insertApiKey({
      keyHash: 'queue-exc-keyhash',
      keyLast4: 'last',
      emailHash: 'queue-exc-emailhash',
      status: 'active',
    })
    const report = await app.store.insertAgentReport(
      {
        reporterFirstName: null,
        reporterCity: null,
        reporterCountry: null,
        reportedFirstName: 'Pending',
        reportedCity: 'Paris',
        reportedCountry: 'FR',
        text: 'queue exception probe',
        actionDate: null,
        severity: null,
        selfReportedModel: null,
        clientIpHash: null,
        source: 'api',
      },
      'queue-exc-keyhash',
      'pending',
    )

    const reject = await app.inject({
      method: 'POST',
      url: `/api/admin/queue/${report.id}/action`,
      headers: { cookie },
      payload: { action: 'reject', reason: 'Ada Lovelace flagged this entry.' },
    })
    expect(reject.statusCode).toBe(200)

    // The audit row's `details` column stores the sanitized reason. The
    // exception list should have preserved "Ada Lovelace".
    const audits = await app.store.listAuditLogForTarget(report.id)
    const rejectAudit = audits.find((a) => a.action === 'reject')
    expect(rejectAudit?.details).toContain('Ada Lovelace')
  })
})
