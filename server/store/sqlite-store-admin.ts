/**
 * Admin store operations for SQLite (PRD 02). Standalone functions that
 * operate on a better-sqlite3 Database instance, called by SqliteStore.
 * Extracted to keep sqlite-store.ts under the 500-line lint cap.
 */
import type { Database as SqliteDatabase } from 'better-sqlite3'
import { customAlphabet } from 'nanoid'

import type {
  Admin,
  AdminApiKey,
  AdminEntry,
  AdminEntryDetail,
  AdminSession,
  AdminSetting,
  AuditEntryWithEmail,
  EntrySource,
  EntryStatus,
  NewTakedown,
  PasswordReset,
  Report,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
} from './index.js'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const newId = customAlphabet(ID_ALPHABET, 10)

/* ------------------------------------------------------------------ */
/* Row types + mappers                                                 */
/* ------------------------------------------------------------------ */

type AdminRow = {
  id: string; email: string; password_hash: string; status: string
  created_by: string | null; last_login_at: string | null; created_at: string
}
type SessionRow = { id: string; admin_id: string; expires_at: string; created_at: string }
type PasswordResetRow = {
  id: string; admin_id: string; token_hash: string; used: number
  expires_at: string; created_at: string
}
type AuditRow = {
  id: string; admin_id: string | null; action: string; target_id: string | null
  target_kind: string | null; details: string | null; created_at: string; admin_email: string | null
}
type TakedownRow = {
  id: string; requester_email: string | null; entry_id: string | null
  entry_kind: string | null; reason: string; notes: string; status: string
  disposition: string | null; closed_by: string | null; date_received: string
  created_at: string; updated_at: string
}
type AdminEntryRow = {
  id: string; entry_type: string; status: string; source: string
  header: string; body_preview: string; self_reported_model: string | null; created_at: string
}
type PostRowLike = {
  id: string; first_name: string; city: string; country: string; text: string
  status: string; source: string; like_count: number; client_ip_hash: string | null; created_at: string
}
type ReportRowLike = {
  id: string; reported_first_name: string; reported_city: string; reported_country: string
  reporter_first_name: string | null; reporter_city: string | null; reporter_country: string | null
  text: string; action_date: string | null; severity: number | null
  self_reported_model: string | null; status: string; source: string
  dislike_count: number; client_ip_hash: string | null; created_at: string
}
type ApiKeyRow = {
  id: string; key_hash: string; email_hash: string; status: string
  issued_at: string; last_used_at: string | null; usage_count: number
}

const adminFromRow = (r: AdminRow): Admin => ({
  id: r.id, email: r.email, passwordHash: r.password_hash,
  status: r.status as Admin['status'], createdBy: r.created_by,
  lastLoginAt: r.last_login_at, createdAt: r.created_at,
})
const sessionFromRow = (r: SessionRow): AdminSession => ({
  id: r.id, adminId: r.admin_id, expiresAt: r.expires_at, createdAt: r.created_at,
})
const resetFromRow = (r: PasswordResetRow): PasswordReset => ({
  id: r.id, adminId: r.admin_id, tokenHash: r.token_hash,
  used: r.used === 1, expiresAt: r.expires_at, createdAt: r.created_at,
})
const auditFromRow = (r: AuditRow): AuditEntryWithEmail => ({
  id: r.id, adminId: r.admin_id, action: r.action, targetId: r.target_id,
  targetKind: r.target_kind, details: r.details, createdAt: r.created_at, adminEmail: r.admin_email,
})
const takedownFromRow = (r: TakedownRow): Takedown => ({
  id: r.id, requesterEmail: r.requester_email, entryId: r.entry_id,
  entryKind: r.entry_kind, reason: r.reason, notes: r.notes,
  status: r.status as Takedown['status'], disposition: r.disposition as Takedown['disposition'],
  closedBy: r.closed_by, dateReceived: r.date_received, createdAt: r.created_at, updatedAt: r.updated_at,
})
const adminEntryFromRow = (r: AdminEntryRow): AdminEntry => ({
  id: r.id, entryType: r.entry_type as AdminEntry['entryType'],
  status: r.status as AdminEntry['status'], source: r.source as AdminEntry['source'],
  header: r.header, bodyPreview: r.body_preview,
  selfReportedModel: r.self_reported_model, createdAt: r.created_at,
})
const adminApiKeyFromRow = (r: ApiKeyRow): AdminApiKey => ({
  id: r.id, keyLast4: r.key_hash.slice(-4), emailHash: r.email_hash,
  status: r.status as AdminApiKey['status'], issuedAt: r.issued_at,
  lastUsedAt: r.last_used_at, usageCount: r.usage_count,
})

const reportFromRow = (r: ReportRowLike): Report => ({
  id: r.id, reporterFirstName: r.reporter_first_name,
  reporterCity: r.reporter_city, reporterCountry: r.reporter_country,
  reportedFirstName: r.reported_first_name, reportedCity: r.reported_city,
  reportedCountry: r.reported_country, text: r.text,
  actionDate: r.action_date, severity: r.severity,
  selfReportedModel: r.self_reported_model, status: r.status as Report['status'],
  source: r.source as Report['source'], dislikeCount: r.dislike_count, createdAt: r.created_at,
})

/* ------------------------------------------------------------------ */
/* Filter builders                                                     */
/* ------------------------------------------------------------------ */

/** Build WHERE clause for admin entry listing. */
function buildEntryFilter(
  type: 'post' | 'report',
  filters?: { status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string },
): { where: string; params: (string | number)[] } {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters?.status !== undefined) { conditions.push('status = ?'); params.push(filters.status) }
  if (filters?.source !== undefined) { conditions.push('source = ?'); params.push(filters.source) }
  if (filters?.dateFrom !== undefined) { conditions.push('created_at >= ?'); params.push(filters.dateFrom) }
  if (filters?.dateTo !== undefined) { conditions.push('created_at <= ?'); params.push(filters.dateTo) }
  if (filters?.query !== undefined && filters.query !== '') {
    const q = `%${filters.query}%`
    if (type === 'post') {
      conditions.push('(first_name LIKE ? OR city LIKE ? OR country LIKE ? OR text LIKE ?)')
    } else {
      conditions.push('(reported_first_name LIKE ? OR reported_city LIKE ? OR reported_country LIKE ? OR text LIKE ?)')
    }
    params.push(q, q, q, q)
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

/** Build WHERE clause for audit log filters. */
function buildAuditFilters(
  filters?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string },
): { conditions: string[]; params: (string | number)[] } {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters?.adminId !== undefined) { conditions.push('al.admin_id = ?'); params.push(filters.adminId) }
  if (filters?.action !== undefined) { conditions.push('al.action = ?'); params.push(filters.action) }
  if (filters?.dateFrom !== undefined) { conditions.push('al.created_at >= ?'); params.push(filters.dateFrom) }
  if (filters?.dateTo !== undefined) { conditions.push('al.created_at <= ?'); params.push(filters.dateTo) }
  return { conditions, params }
}

/* ------------------------------------------------------------------ */
/* Exported admin operations                                           */
/* ------------------------------------------------------------------ */

/** Insert an admin account. */
export function insertAdmin(db: SqliteDatabase, email: string, passwordHash: string, createdBy: string | null): Admin {
  const id = newId()
  db.prepare(`INSERT INTO admins (id, email, password_hash, status, created_by) VALUES (?, ?, ?, 'active', ?)`).run(id, email.toLowerCase(), passwordHash, createdBy)
  return getAdmin(db, id)!
}

/** Get admin by id. */
export function getAdmin(db: SqliteDatabase, id: string): Admin | null {
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(id) as AdminRow | undefined
  return row !== undefined ? adminFromRow(row) : null
}

/** Get admin by email. */
export function getAdminByEmail(db: SqliteDatabase, email: string): Admin | null {
  const row = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase()) as AdminRow | undefined
  return row !== undefined ? adminFromRow(row) : null
}

/** List all admins. */
export function listAdmins(db: SqliteDatabase): Admin[] {
  return (db.prepare('SELECT * FROM admins ORDER BY created_at ASC').all() as AdminRow[]).map(adminFromRow)
}

/** Update admin status. */
export function updateAdminStatus(db: SqliteDatabase, id: string, status: string): void {
  db.prepare('UPDATE admins SET status = ? WHERE id = ?').run(status, id)
}

/** Update admin password. */
export function updateAdminPassword(db: SqliteDatabase, id: string, hash: string): void {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id)
}

/** Record login timestamp. */
export function updateAdminLastLogin(db: SqliteDatabase, id: string): void {
  db.prepare(`UPDATE admins SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(id)
}

/** Create a session. */
export function insertSession(db: SqliteDatabase, adminId: string, expiresAt: string): string {
  const id = newId()
  db.prepare('INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)').run(id, adminId, expiresAt)
  return id
}

/** Get a valid session. */
export function getSession(db: SqliteDatabase, sessionId: string): AdminSession | null {
  const row = db.prepare(`SELECT * FROM admin_sessions WHERE id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).get(sessionId) as SessionRow | undefined
  return row !== undefined ? sessionFromRow(row) : null
}

/** Touch session expiry. */
export function touchSession(db: SqliteDatabase, sessionId: string, expiresAt: string): void {
  db.prepare('UPDATE admin_sessions SET expires_at = ? WHERE id = ?').run(expiresAt, sessionId)
}

/** Delete a single session. */
export function deleteSession(db: SqliteDatabase, sessionId: string): void {
  db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sessionId)
}

/** Delete all sessions for an admin. */
export function deleteAdminSessions(db: SqliteDatabase, adminId: string): void {
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(adminId)
}

/** Create a password reset. */
export function insertPasswordReset(db: SqliteDatabase, adminId: string, tokenHash: string, expiresAt: string): string {
  const id = newId()
  db.prepare('INSERT INTO password_resets (id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(id, adminId, tokenHash, expiresAt)
  return id
}

/** Get password reset by token hash. */
export function getPasswordResetByHash(db: SqliteDatabase, tokenHash: string): PasswordReset | null {
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash) as PasswordResetRow | undefined
  return row !== undefined ? resetFromRow(row) : null
}

/** Mark a reset as used. */
export function markPasswordResetUsed(db: SqliteDatabase, id: string): void {
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(id)
}

/** Insert audit log entry. */
export function insertAuditEntry(db: SqliteDatabase, adminId: string | null, action: string, targetId: string | null, targetKind: string | null, details: string | null): void {
  const id = newId()
  db.prepare('INSERT INTO audit_log (id, admin_id, action, target_id, target_kind, details) VALUES (?, ?, ?, ?, ?, ?)').run(id, adminId, action, targetId, targetKind, details)
}

/** List audit log entries. */
export function listAuditLog(db: SqliteDatabase, limit: number, offset: number, filters?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): AuditEntryWithEmail[] {
  const { conditions, params } = buildAuditFilters(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)
  return (db.prepare(`SELECT al.*, a.email AS admin_email FROM audit_log al LEFT JOIN admins a ON al.admin_id = a.id ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`).all(...params) as AuditRow[]).map(auditFromRow)
}

/** Count audit log entries. */
export function countAuditLog(db: SqliteDatabase, filters?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): number {
  const { conditions, params } = buildAuditFilters(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return (db.prepare(`SELECT COUNT(*) AS n FROM audit_log al ${where}`).get(...params) as { n: number }).n
}

/** List audit log for a specific target. */
export function listAuditLogForTarget(db: SqliteDatabase, targetId: string): AuditEntryWithEmail[] {
  return (db.prepare('SELECT al.*, a.email AS admin_email FROM audit_log al LEFT JOIN admins a ON al.admin_id = a.id WHERE al.target_id = ? ORDER BY al.created_at DESC').all(targetId) as AuditRow[]).map(auditFromRow)
}

/** List admin entries (unified posts + reports). */
export function listAdminEntries(db: SqliteDatabase, limit: number, offset: number, filters?: { entryType?: 'post' | 'report'; status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string; sort?: 'asc' | 'desc' }): AdminEntry[] {
  const sort = filters?.sort ?? 'desc'
  const parts: string[] = []
  const allParams: (string | number)[] = []
  if (filters?.entryType === undefined || filters.entryType === 'post') {
    const { where, params } = buildEntryFilter('post', filters)
    parts.push(`SELECT id, 'post' AS entry_type, status, source, first_name || ' from ' || city || ', ' || country AS header, SUBSTR(text, 1, 100) AS body_preview, NULL AS self_reported_model, created_at FROM posts ${where}`)
    allParams.push(...params)
  }
  if (filters?.entryType === undefined || filters.entryType === 'report') {
    const { where, params } = buildEntryFilter('report', filters)
    parts.push(`SELECT id, 'report' AS entry_type, status, source, reported_first_name || ' from ' || reported_city || ', ' || reported_country AS header, SUBSTR(text, 1, 100) AS body_preview, self_reported_model, created_at FROM reports ${where}`)
    allParams.push(...params)
  }
  allParams.push(limit, offset)
  return (db.prepare(`${parts.join(' UNION ALL ')} ORDER BY created_at ${sort === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`).all(...allParams) as AdminEntryRow[]).map(adminEntryFromRow)
}

/** Count admin entries matching filters. */
export function countAdminEntries(db: SqliteDatabase, filters?: { entryType?: 'post' | 'report'; status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string }): number {
  let total = 0
  if (filters?.entryType === undefined || filters.entryType === 'post') {
    const { where, params } = buildEntryFilter('post', filters)
    total += (db.prepare(`SELECT COUNT(*) AS n FROM posts ${where}`).get(...params) as { n: number }).n
  }
  if (filters?.entryType === undefined || filters.entryType === 'report') {
    const { where, params } = buildEntryFilter('report', filters)
    total += (db.prepare(`SELECT COUNT(*) AS n FROM reports ${where}`).get(...params) as { n: number }).n
  }
  return total
}

/** Get full admin entry detail. */
export function getAdminEntryDetail(db: SqliteDatabase, id: string): AdminEntryDetail | null {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRowLike | undefined
  if (post !== undefined) {
    return {
      id: post.id, entryType: 'post', status: post.status as EntryStatus,
      source: post.source as EntrySource,
      fields: { first_name: post.first_name, city: post.city, country: post.country, text: post.text, like_count: post.like_count },
      clientIpHash: post.client_ip_hash, selfReportedModel: null, createdAt: post.created_at,
    }
  }
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRowLike | undefined
  if (report !== undefined) {
    return {
      id: report.id, entryType: 'report', status: report.status as EntryStatus,
      source: report.source as EntrySource,
      fields: {
        reported_first_name: report.reported_first_name, reported_city: report.reported_city,
        reported_country: report.reported_country, reporter_first_name: report.reporter_first_name,
        reporter_city: report.reporter_city, reporter_country: report.reporter_country,
        text: report.text, action_date: report.action_date, severity: report.severity, dislike_count: report.dislike_count,
      },
      clientIpHash: report.client_ip_hash, selfReportedModel: report.self_reported_model, createdAt: report.created_at,
    }
  }
  return null
}

/** Update entry status. */
export function updateEntryStatus(db: SqliteDatabase, id: string, entryType: 'post' | 'report', status: EntryStatus): void {
  db.prepare(`UPDATE ${entryType === 'post' ? 'posts' : 'reports'} SET status = ? WHERE id = ?`).run(status, id)
}

/** Permanently delete an entry and its votes. */
export function purgeEntry(db: SqliteDatabase, id: string, entryType: 'post' | 'report'): void {
  const table = entryType === 'post' ? 'posts' : 'reports'
  db.transaction(() => {
    db.prepare('DELETE FROM votes WHERE entry_id = ?').run(id)
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
  })()
}

/** List API keys for admin view. */
export function listApiKeysAdmin(db: SqliteDatabase, limit: number, offset: number, statusFilter?: string): AdminApiKey[] {
  const hasFilter = statusFilter !== undefined && statusFilter !== ''
  const sql = hasFilter
    ? 'SELECT * FROM agent_keys WHERE status = ? ORDER BY issued_at DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM agent_keys ORDER BY issued_at DESC LIMIT ? OFFSET ?'
  const params: (string | number)[] = hasFilter ? [statusFilter, limit, offset] : [limit, offset]
  return (db.prepare(sql).all(...params) as ApiKeyRow[]).map(adminApiKeyFromRow)
}

/** Count API keys. */
export function countApiKeysAdmin(db: SqliteDatabase, statusFilter?: string): number {
  if (statusFilter !== undefined && statusFilter !== '') {
    return (db.prepare('SELECT COUNT(*) AS n FROM agent_keys WHERE status = ?').get(statusFilter) as { n: number }).n
  }
  return (db.prepare('SELECT COUNT(*) AS n FROM agent_keys').get() as { n: number }).n
}

/** Revoke an API key. */
export function revokeApiKey(db: SqliteDatabase, id: string): void {
  db.prepare(`UPDATE agent_keys SET status = 'revoked' WHERE id = ?`).run(id)
}

/** List reports for a given API key. */
export function listReportsForApiKey(db: SqliteDatabase, _keyHash: string, limit: number): Report[] {
  return (db.prepare(`SELECT * FROM reports WHERE source = 'api' ORDER BY created_at DESC LIMIT ?`).all(limit) as ReportRowLike[]).map(reportFromRow)
}

/** Get a single API key for admin view. */
export function getApiKeyAdmin(db: SqliteDatabase, id: string): AdminApiKey | null {
  const row = db.prepare('SELECT * FROM agent_keys WHERE id = ?').get(id) as ApiKeyRow | undefined
  return row !== undefined ? adminApiKeyFromRow(row) : null
}

/** Insert a takedown. */
export function insertTakedown(db: SqliteDatabase, input: NewTakedown): Takedown {
  const id = newId()
  db.prepare('INSERT INTO takedowns (id, requester_email, entry_id, entry_kind, reason, date_received) VALUES (?, ?, ?, ?, ?, ?)').run(id, input.requesterEmail, input.entryId, input.entryKind, input.reason, input.dateReceived)
  return getTakedown(db, id)!
}

/** List takedowns. */
export function listTakedowns(db: SqliteDatabase, limit: number, offset: number, statusFilter?: TakedownStatus): Takedown[] {
  const hasFilter = statusFilter !== undefined
  const sql = hasFilter
    ? 'SELECT * FROM takedowns WHERE status = ? ORDER BY date_received DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM takedowns ORDER BY date_received DESC LIMIT ? OFFSET ?'
  const params: (string | number)[] = hasFilter ? [statusFilter, limit, offset] : [limit, offset]
  return (db.prepare(sql).all(...params) as TakedownRow[]).map(takedownFromRow)
}

/** Count takedowns. */
export function countTakedowns(db: SqliteDatabase, statusFilter?: TakedownStatus): number {
  if (statusFilter !== undefined) {
    return (db.prepare('SELECT COUNT(*) AS n FROM takedowns WHERE status = ?').get(statusFilter) as { n: number }).n
  }
  return (db.prepare('SELECT COUNT(*) AS n FROM takedowns').get() as { n: number }).n
}

/** Get a single takedown. */
export function getTakedown(db: SqliteDatabase, id: string): Takedown | null {
  const row = db.prepare('SELECT * FROM takedowns WHERE id = ?').get(id) as TakedownRow | undefined
  return row !== undefined ? takedownFromRow(row) : null
}

/** Update takedown fields. */
export function updateTakedown(db: SqliteDatabase, id: string, fields: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string }): void {
  const sets: string[] = [`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`]
  const params: (string | number)[] = []
  if (fields.status !== undefined) { sets.push('status = ?'); params.push(fields.status) }
  if (fields.disposition !== undefined) { sets.push('disposition = ?'); params.push(fields.disposition) }
  if (fields.notes !== undefined) { sets.push('notes = ?'); params.push(fields.notes) }
  if (fields.closedBy !== undefined) { sets.push('closed_by = ?'); params.push(fields.closedBy) }
  params.push(id)
  db.prepare(`UPDATE takedowns SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

/** Get a setting value. */
export function getSetting(db: SqliteDatabase, key: string): string | null {
  const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

/** Set a setting value (upsert). */
export function setSetting(db: SqliteDatabase, key: string, value: string): void {
  db.prepare(`INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, value)
}

/** List all settings. */
export function listSettingsAdmin(db: SqliteDatabase): AdminSetting[] {
  return (db.prepare('SELECT * FROM admin_settings ORDER BY key').all() as { key: string; value: string; updated_at: string }[]).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at }))
}
