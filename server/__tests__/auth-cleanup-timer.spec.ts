// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Behavioural lock for the periodic auth-state cleanup wired in
 * server/deps.ts. Two invariants are tested:
 *
 *  1. NODE_ENV=test: the timer is NOT registered. Vitest workers reuse
 *     the same Node process across spec files; an interval firing during
 *     a sibling spec's seed could DELETE rows the sibling just inserted.
 *     The decoration is set to `null` so call sites can still inspect it.
 *
 *  2. NODE_ENV=development: the timer IS registered, runs unref'd, and
 *     onClose clears it before tearing down the store. Without the
 *     ordering guarantee, an in-flight tick could race a closed handle
 *     and surface as an unhandled rejection during shutdown.
 *
 * The cadence (1 hour) and the .unref() call are not asserted because
 * they're implementation details that mockable timers would have to
 * special-case; the test focuses on registration semantics.
 */

// Snapshot every env key both tests mutate so vitest workers stay isolated;
// IP_HASH_SALT/DEV_RATE_MULTIPLIER are read by the eager `config.ts` parse
// at module import, so leaking them changes ordering-dependent behaviour
// in sibling specs.
const previousEnv = {
  SQLITE_PATH: process.env.SQLITE_PATH,
  NODE_ENV: process.env.NODE_ENV,
  IP_HASH_SALT: process.env.IP_HASH_SALT,
  DEV_RATE_MULTIPLIER: process.env.DEV_RATE_MULTIPLIER,
} as const

let app: FastifyInstance | undefined
let tmpDir: string

beforeEach(() => {
  // Fresh tmpdir per test so the dev-mode test cannot leave a stale
  // SQLite WAL behind that the next test would inherit. Vitest does not
  // recreate the worker process between specs in the same file.
  tmpDir = mkdtempSync(join(tmpdir(), 'ihelped-auth-cleanup-'))
  // `config.ts` reads env eagerly at module import; without a reset, the
  // second test would see the first test's SQLITE_PATH (and a removed
  // tmpdir) instead of the fresh value set above.
  vi.resetModules()
})

afterEach(async () => {
  // Wrap close in try/finally so a teardown failure on one spec cannot
  // skip env restoration / tmpdir cleanup and bleed state into the next.
  try {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe('periodic auth-state cleanup wiring', () => {
  it('registers a timer in development and clears it on close', async () => {
    process.env.SQLITE_PATH = join(tmpDir, 'dev.db')
    process.env.NODE_ENV = 'development'
    process.env.IP_HASH_SALT = 'test-salt'
    process.env.DEV_RATE_MULTIPLIER = '1'
    // Vitest module cache survives across specs; force a fresh import so
    // the new env values reach the eager `config` parse in `config.ts`.
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    await app.ready()
    const handle = app.authCleanupTimer
    expect(handle === null ? null : typeof handle).toBe('object')
    await app.close()
    // After close the decoration is reset to null. Without the explicit
    // reset, an external caller could still hold the cleared handle and
    // attempt to clear it again.
    expect(app.authCleanupTimer).toBe(null)
    app = undefined
  })

  it('does NOT register a timer in NODE_ENV=test (cross-spec safety)', async () => {
    process.env.SQLITE_PATH = join(tmpDir, 'test.db')
    process.env.NODE_ENV = 'test'
    process.env.IP_HASH_SALT = 'test-salt'
    process.env.DEV_RATE_MULTIPLIER = '1'
    const { buildApp } = await import('../index.js')
    app = await buildApp()
    await app.ready()
    expect(app.authCleanupTimer).toBe(null)
  })
})
