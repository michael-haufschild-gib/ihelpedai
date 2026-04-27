/**
 * Atomic SQLite admin mutations that must write governance audit rows with
 * the state change. Route code sanitizes/validates first, then calls these.
 */
import type { Database as SqliteDatabase } from 'better-sqlite3'

import type {
  AdminAuditInput,
  AdminInviteResult,
  AdminPasswordAuditOptions,
  EntryStatus,
  NewTakedown,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
} from './index.js'
import {
  deleteAdminSessions,
  insertAdmin,
  insertAuditEntry,
  insertPasswordReset,
  insertTakedown,
  markPasswordResetUsed,
  setSetting,
  updateAdminStatus,
  updateAdminPassword,
  updateEntryStatus,
  updateTakedown,
} from './sqlite-store-admin.js'

/** Create invited admin, audit row, and reset token in one transaction. */
export function insertAdminInviteWithAudit(
  db: SqliteDatabase,
  email: string,
  passwordHash: string,
  createdBy: string | null,
  tokenHash: string,
  expiresAt: string,
): AdminInviteResult {
  return db.transaction((): AdminInviteResult => {
    const admin = insertAdmin(db, email, passwordHash, createdBy)
    insertAuditEntry(db, createdBy, 'create_admin', admin.id, 'admin', null)
    const resetId = insertPasswordReset(db, admin.id, tokenHash, expiresAt)
    return { admin, resetId }
  })()
}

/** Remove every row created for an invite that failed before email delivery. */
export function deleteFailedAdminInvite(db: SqliteDatabase, adminId: string, resetId: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM password_resets WHERE id = ? AND admin_id = ?').run(resetId, adminId)
    db.prepare(
      `DELETE FROM audit_log
       WHERE target_id = ? AND target_kind = 'admin' AND action = 'create_admin'`,
    ).run(adminId)
    db.prepare('DELETE FROM admins WHERE id = ?').run(adminId)
  })()
}

/** Deactivate an admin, clear sessions, and audit atomically. */
export function deactivateAdminWithAudit(db: SqliteDatabase, id: string, audit: AdminAuditInput): void {
  db.transaction(() => {
    updateAdminStatus(db, id, 'deactivated')
    deleteAdminSessions(db, id)
    insertAudit(db, audit)
  })()
}

/** Update password, clear auth state, and audit atomically. */
export function updateAdminPasswordWithAudit(
  db: SqliteDatabase,
  id: string,
  passwordHash: string,
  audit: AdminAuditInput,
  opts: AdminPasswordAuditOptions = {},
): void {
  db.transaction(() => {
    updateAdminPassword(db, id, passwordHash)
    if (opts.resetId !== undefined) markPasswordResetUsed(db, opts.resetId)
    deleteAdminSessions(db, id, opts.exceptSessionId)
    insertAudit(db, audit)
  })()
}

/** Update entry status and audit atomically. */
export function updateEntryStatusWithAudit(
  db: SqliteDatabase,
  id: string,
  entryType: 'post' | 'report',
  status: EntryStatus,
  audit: AdminAuditInput,
): void {
  db.transaction(() => {
    updateEntryStatus(db, id, entryType, status)
    insertAudit(db, audit)
  })()
}

/** Purge an entry and audit atomically. */
export function purgeEntryWithAudit(
  db: SqliteDatabase,
  id: string,
  entryType: 'post' | 'report',
  audit: AdminAuditInput,
): void {
  const table = entryType === 'post' ? 'posts' : 'reports'
  db.transaction(() => {
    db.prepare('DELETE FROM votes WHERE entry_id = ? AND entry_kind = ?').run(id, entryType)
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    insertAudit(db, audit)
  })()
}

/** Revoke an API key and audit atomically. */
export function revokeApiKeyWithAudit(db: SqliteDatabase, id: string, audit: AdminAuditInput): void {
  db.transaction(() => {
    db.prepare(`UPDATE agent_keys SET status = 'revoked' WHERE id = ?`).run(id)
    insertAudit(db, audit)
  })()
}

/** Insert a takedown and audit atomically. */
export function insertTakedownWithAudit(db: SqliteDatabase, input: NewTakedown, audit: AdminAuditInput): Takedown {
  return db.transaction((): Takedown => {
    const takedown = insertTakedown(db, input)
    insertAudit(db, { ...audit, targetId: takedown.id })
    return takedown
  })()
}

/** Update a takedown and audit atomically. */
export function updateTakedownWithAudit(
  db: SqliteDatabase,
  id: string,
  fields: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null },
  audit: AdminAuditInput,
): void {
  db.transaction(() => {
    updateTakedown(db, id, fields)
    insertAudit(db, audit)
  })()
}

/** Upsert a setting and audit atomically. */
export function setSettingWithAudit(db: SqliteDatabase, key: string, value: string, audit: AdminAuditInput): void {
  db.transaction(() => {
    setSetting(db, key, value)
    insertAudit(db, audit)
  })()
}

function insertAudit(db: SqliteDatabase, audit: AdminAuditInput): void {
  insertAuditEntry(db, audit.adminId, audit.action, audit.targetId, audit.targetKind, audit.details)
}
