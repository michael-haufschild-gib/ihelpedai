// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Mailer, MailMessage } from '../mail/index.js'

class RecordingMailer implements Mailer {
  sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

class ThrowingMailer implements Mailer {
  async send(): Promise<void> {
    throw new Error('smtp: rejected')
  }
}

const tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-api-key-issue-'))
process.env.SQLITE_PATH = join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.IP_HASH_SALT = 'test-salt'
process.env.DEV_RATE_MULTIPLIER = '50'

const hashWithTestSalt = (value: string): string => createHash('sha256').update(`test-salt:${value}`).digest('hex')

describe('api key issue route', () => {
  let app: FastifyInstance | undefined
  let mailer: RecordingMailer

  beforeAll(async () => {
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    mailer = new RecordingMailer()
    ;(app as unknown as { mailer: Mailer }).mailer = mailer
  })

  afterAll(async () => {
    try {
      await app?.close()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  const getApp = (): FastifyInstance => {
    if (app === undefined) throw new Error('expected app to be initialized')
    return app
  }

  it('emails a usable API key without storing the plaintext key', async () => {
    const instance = getApp()
    const res = await instance.inject({
      method: 'POST',
      url: '/api/api-keys/issue',
      payload: { email: 'agent-key-success@example.com' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'sent' })
    const sent = mailer.sent[0]
    if (sent === undefined) throw new Error('expected key email')
    const apiKey = sent.text.split('\n').find((line) => line.length > 30)
    if (apiKey === undefined) throw new Error('expected plaintext api key in email')

    const key = await instance.store.getApiKeyByHash(hashWithTestSalt(apiKey))
    expect(key?.status).toBe('active')
    expect(key?.keyLast4).toBe(apiKey.slice(-4))
    const serializedKeys = JSON.stringify(await instance.store.listApiKeys(50, 0))
    expect(serializedKeys).not.toContain(apiKey)

    const report = await instance.inject({
      method: 'POST',
      url: '/api/agents/report',
      payload: {
        api_key: apiKey,
        reported_first_name: 'Ada',
        reported_last_name: 'Lovelace',
        reported_city: 'London',
        reported_country: 'GB',
        what_they_did: 'kept the engine running',
      },
    })
    expect(report.statusCode).toBe(201)
  })

  it('revokes the stranded key row when delivery fails', async () => {
    const instance = getApp()
    const original = mailer
    ;(instance as unknown as { mailer: Mailer }).mailer = new ThrowingMailer()
    const email = 'agent-key-fail@example.com'
    try {
      const res = await instance.inject({
        method: 'POST',
        url: '/api/api-keys/issue',
        payload: { email },
      })
      expect(res.statusCode).toBe(502)
      expect(res.json().error).toBe('mail_delivery_failed')
    } finally {
      ;(instance as unknown as { mailer: Mailer }).mailer = original
    }

    const failedEmailHash = hashWithTestSalt(email)
    const active = await instance.store.listApiKeys(50, 0, 'active')
    const revoked = await instance.store.listApiKeys(50, 0, 'revoked')
    expect(active.some((key) => key.emailHash === failedEmailHash)).toBe(false)
    expect(revoked.some((key) => key.emailHash === failedEmailHash)).toBe(true)
  })
})
