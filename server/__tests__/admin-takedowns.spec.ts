// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration coverage for server/routes/admin/takedowns.ts. Locks in:
 *  - requireAdmin gate (401 without cookie)
 *  - create → list round-trip, including the audit-log entry
 *  - create rejects an invalid-calendar date (Feb 30) via isValidIsoDate
 *  - patch sets closed_by when status=closed and clears it on re-open
 *  - patch rejects an unknown disposition enum value
 */
describe('admin takedowns routes', () => {
  let app: FastifyInstance
  let cookie: string

  beforeAll(async () => {
    process.env.SQLITE_PATH = join(
      mkdtempSync(join(tmpdir(), 'ihelped-admin-takedowns-')),
      'test.db',
    )
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    const hash = await bcrypt.hash('testpassword12', 10)
    await app.store.insertAdmin('ops@admin.ai', hash, null)
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'ops@admin.ai', password: 'testpassword12' },
    })
    expect(login.statusCode).toBe(200)
    const raw = login.headers['set-cookie']
    cookie = typeof raw === 'string' ? raw : (raw as string[])[0]
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/admin/takedowns without cookie returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/takedowns' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/admin/takedowns creates a row, round-trips through list, records an audit entry', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: {
        requester_email: 'victim@example.com',
        entry_id: null,
        reason: 'Name is wrong.',
        date_received: '2026-04-20',
      },
    })
    expect(create.statusCode).toBe(201)
    const created = create.json() as { id: string; status: string; dateReceived: string }
    expect(created.status).toBe('open')
    expect(created.dateReceived).toBe('2026-04-20')

    const list = await app.inject({ method: 'GET', url: '/api/admin/takedowns', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    const body = list.json() as { items: Array<{ id: string }>; total: number }
    expect(body.items.some((t) => t.id === created.id)).toBe(true)
    expect(body.total).toBeGreaterThanOrEqual(1)

    // The audit entry is not echoed back on create; read it via the audit
    // store method to prove the `insertAuditEntry(... 'create_takedown' ...)`
    // call fired. Missing audit entries have bitten admin flows before.
    const audits = await app.store.listAuditLogForTarget(created.id)
    expect(audits.some((a) => a.action === 'create_takedown')).toBe(true)
  })

  it('POST rejects Feb 30 as an invalid_date', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: {
        requester_email: null,
        entry_id: null,
        reason: 'Something.',
        date_received: '2026-02-30',
      },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string; fields?: { date_received?: unknown } }
    expect(body.error).toBe('invalid_input')
    // date_received failure from Zod + refine arrives as a non-empty string
    // array on the flattened fieldErrors envelope. Assert the specific shape
    // so a regression (eg fields: {}) doesn't pass silently.
    expect(Array.isArray(body.fields?.date_received)).toBe(true)
    expect((body.fields?.date_received as string[]).length).toBeGreaterThan(0)
  })

  it('PATCH with status=closed sets closedBy; re-open clears it', async () => {
    // Seed a fresh takedown so the state transitions are isolated.
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: { reason: 'Close-cycle test.', date_received: '2026-04-21' },
    })
    expect(create.statusCode).toBe(201)
    const { id } = create.json() as { id: string }

    const close = await app.inject({
      method: 'PATCH',
      url: `/api/admin/takedowns/${id}`,
      headers: { cookie },
      payload: { status: 'closed', disposition: 'entry_deleted', notes: 'Resolved.' },
    })
    expect(close.statusCode).toBe(200)
    const closed = close.json() as { status: string; disposition: string; closedBy: string | null }
    expect(closed.status).toBe('closed')
    expect(closed.disposition).toBe('entry_deleted')
    expect(typeof closed.closedBy).toBe('string')

    const reopen = await app.inject({
      method: 'PATCH',
      url: `/api/admin/takedowns/${id}`,
      headers: { cookie },
      payload: { status: 'open' },
    })
    expect(reopen.statusCode).toBe(200)
    const reopened = reopen.json() as { status: string; closedBy: string | null }
    expect(reopened.status).toBe('open')
    expect(reopened.closedBy).toBe(null)
  })

  it('PATCH rejects an unknown disposition enum value', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/takedowns',
      headers: { cookie },
      payload: { reason: 'Enum test.', date_received: '2026-04-22' },
    })
    const { id } = create.json() as { id: string }

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/takedowns/${id}`,
      headers: { cookie },
      payload: { disposition: 'definitely_not_a_valid_enum' },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_input')
  })

  it('GET /api/admin/takedowns/:id returns 404 for an unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/takedowns/does-not-exist',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(404)
  })
})
