// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

import type { envSchema as EnvSchema } from '../config.js'

let envSchema: typeof EnvSchema

beforeAll(async () => {
  ;({ envSchema } = await import('../config.js'))
})

describe('server config validation', () => {
  it('rejects invalid MAIL_FROM values at boot-time schema validation', () => {
    const parsed = envSchema.safeParse({ MAIL_FROM: 'not an email address' })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('expected invalid MAIL_FROM to fail')
    expect(parsed.error.flatten().fieldErrors.MAIL_FROM).toEqual(['Invalid email address'])
  })

  it('accepts the default MAIL_FROM value', () => {
    const parsed = envSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error('expected default config to parse')
    expect(parsed.data.MAIL_FROM).toBe('noreply@ihelped.ai')
  })

  it('binds the HTTP listener to loopback by default', () => {
    const parsed = envSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error('expected default config to parse')
    expect(parsed.data.BIND_HOST).toBe('127.0.0.1')
  })

  it('rejects wildcard production API binds', () => {
    const parsed = envSchema.safeParse({
      NODE_ENV: 'production',
      BIND_HOST: '0.0.0.0',
      PUBLIC_URL: 'https://ihelped.ai',
      IP_HASH_SALT: 'prod-ip-hash-salt',
      ADMIN_SESSION_SECRET: 'prod-session-secret',
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('expected wildcard BIND_HOST to fail')
    expect(parsed.error.flatten().fieldErrors.BIND_HOST).toEqual([
      'Production must bind the API to loopback behind nginx (127.0.0.1 or ::1)',
    ])
  })

  it('accepts explicit loopback production API binds', () => {
    const parsed = envSchema.safeParse({
      NODE_ENV: 'production',
      BIND_HOST: '::1',
      PUBLIC_URL: 'https://ihelped.ai',
      IP_HASH_SALT: 'prod-ip-hash-salt',
      ADMIN_SESSION_SECRET: 'prod-session-secret',
    })
    expect(parsed.success).toBe(true)
  })
})
