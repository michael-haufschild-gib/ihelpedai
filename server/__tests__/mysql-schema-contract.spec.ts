// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const schema = readFileSync(resolve('deploy/schema/001-init.mysql.sql'), 'utf8')

describe('MySQL schema contract', () => {
  it('keeps text column limits aligned with route validators', () => {
    expect(schema).toMatch(/reason\s+VARCHAR\(2000\)\s+NOT NULL/)
    expect(schema).toMatch(/notes\s+VARCHAR\(5000\)\s+NOT NULL DEFAULT ''/)
    expect(schema).toMatch(/value\s+VARCHAR\(10000\)\s+NOT NULL/)
  })

  it('upgrades pre-existing MySQL columns that used older shorter limits', () => {
    expect(schema).toContain('MODIFY COLUMN reason VARCHAR(2000) NOT NULL')
    expect(schema).toContain("MODIFY COLUMN notes VARCHAR(5000) NOT NULL DEFAULT ''")
    expect(schema).toContain('MODIFY COLUMN value VARCHAR(10000) NOT NULL')
  })

  it('indexes audit log target lookups used by admin entry detail pages', () => {
    expect(schema).toContain('KEY idx_audit_log_target     (target_id, created_at)')
    expect(schema).toContain('ALTER TABLE audit_log ADD KEY idx_audit_log_target (target_id, created_at)')
  })

  it('indexes password reset expiry cleanup', () => {
    expect(schema).toContain('KEY idx_password_resets_expires_at (expires_at)')
    expect(schema).toContain('ALTER TABLE password_resets ADD KEY idx_password_resets_expires_at (expires_at)')
  })

  it('stores API-key plaintext suffix separately from the verifier hash', () => {
    expect(schema).toContain('key_last4     VARCHAR(8)   NOT NULL')
    expect(schema).toContain('ALTER TABLE agent_keys ADD COLUMN key_last4 VARCHAR(8) NOT NULL DEFAULT')
    // Legacy rows must NOT be backfilled from key_hash — RIGHT(key_hash, 4)
    // is not the original key suffix and would mislead operators.
    expect(schema).not.toContain('UPDATE agent_keys SET key_last4 = RIGHT(key_hash, 4)')
  })

  it('canonicalizes legacy takedown entry kinds before adding the CHECK constraint', () => {
    expect(schema).toContain('JOIN posts p ON p.id = t.entry_id')
    expect(schema).toContain("SET t.entry_kind = 'post'")
    expect(schema).toContain('JOIN reports r ON r.id = t.entry_id')
    expect(schema).toContain("SET t.entry_kind = 'report'")
    expect(schema).toContain("WHERE entry_kind IS NOT NULL AND entry_kind NOT IN ('post', 'report')")
  })

  it('bounds enum-like domains with database CHECK constraints', () => {
    for (const constraint of [
      'chk_posts_status',
      'chk_posts_source',
      'chk_reports_status',
      'chk_reports_source',
      'chk_reports_severity',
      'chk_agent_keys_status',
      'chk_admins_status',
      'chk_takedowns_status',
      'chk_takedowns_disposition',
    ]) {
      expect(schema).toContain(constraint)
    }
    expect(schema).toContain("CHECK (status IN ('live', 'pending', 'deleted'))")
    expect(schema).toContain("CHECK (source IN ('form', 'api'))")
    expect(schema).toContain('CHECK (severity IS NULL OR severity BETWEEN 1 AND 10)')
    expect(schema).toContain("CHECK (status IN ('active', 'revoked'))")
    expect(schema).toContain("CHECK (status IN ('active', 'deactivated'))")
    expect(schema).toContain("CHECK (status IN ('open', 'closed'))")
    expect(schema).toContain(
      "CHECK (disposition IS NULL OR disposition IN ('entry_deleted', 'entry_kept', 'entry_edited', 'other'))",
    )
  })
})
