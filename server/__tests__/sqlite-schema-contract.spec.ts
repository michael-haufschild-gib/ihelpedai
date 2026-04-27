// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const schema = readFileSync(resolve('deploy/schema/001-init.sqlite.sql'), 'utf8')

describe('SQLite schema contract', () => {
  it('bounds enum-like domains with CHECK constraints on fresh databases', () => {
    expect(schema).toContain(
      "status          TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'pending', 'deleted'))",
    )
    expect(schema).toContain("source          TEXT NOT NULL DEFAULT 'form' CHECK (source IN ('form', 'api'))")
    expect(schema).toContain('severity              INTEGER CHECK (severity IS NULL OR (severity BETWEEN 1 AND 10))')
    expect(schema).toContain("status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked'))")
    expect(schema).toContain(
      "status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated'))",
    )
    expect(schema).toContain("status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))")
    expect(schema).toContain(
      "disposition     TEXT CHECK (disposition IS NULL OR disposition IN ('entry_deleted', 'entry_kept', 'entry_edited', 'other'))",
    )
  })
})
