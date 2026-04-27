/**
 * Admin store operations for MySQL (PRD 02). Parallels sqlite-store-admin.ts.
 * Exported functions take a mysql2 Pool (most paths) or the MysqlStore itself
 * (when a transaction is needed via store.tx). Row mappers, query helpers,
 * and filter builders live in mysql-store-admin-rows.ts so this file stays
 * under the 500-line lint cap.
 */
import type { Pool } from 'mysql2/promise'

import type {
  Admin,
  AdminApiKey,
  AdminEntry,
  AdminEntryDetail,
  AdminEntryFilter,
  AdminSession,
  AuditEntryWithEmail,
  AuditLogFilter,
  EntrySource,
  EntryStatus,
  PasswordReset,
  Report,
} from './index.js'
import type { MysqlStoreAdminFacade } from './mysql-store-admin-facade.js'
import {
  type AdminEntryRow,
  type AdminRow,
  type ApiKeyRow,
  type AuditRow,
  type PasswordResetRow,
  type PostRowLike,
  type ReportRowLike,
  type SessionRow,
  type Sqlable,
  adminApiKeyFromRow,
  adminEntryFromRow,
  adminFromRow,
  auditFromRow,
  buildAuditFilters,
  buildEntryFilter,
  reportFromRow,
  resetFromRow,
  selectCount,
  selectMany,
  selectOne,
  sessionFromRow,
} from './mysql-store-admin-rows.js'

type MysqlStore = MysqlStoreAdminFacade
import { iso, isoDate, newId } from './mysql-utils.js'

/* ------------------------------------------------------------------ */
/* Exported admin operations                                           */
/* ------------------------------------------------------------------ */

/** Insert an admin account. */
export async function insertAdmin(
  pool: Pool,
  email: string,
  passwordHash: string,
  createdBy: string | null,
): Promise<Admin> {
  const id = newId()
  await pool.execute(
    `INSERT INTO admins (id, email, password_hash, status, created_by) VALUES (?, ?, ?, 'active', ?)`,
    [id, email.toLowerCase(), passwordHash, createdBy],
  )
  const admin = await getAdmin(pool, id)
  if (admin === null) throw new Error('insertAdmin: round-trip read returned null')
  return admin
}

/** Get admin by id. */
export async function getAdmin(pool: Pool, id: string): Promise<Admin | null> {
  return selectOne<AdminRow, Admin>(pool, 'SELECT * FROM admins WHERE id = ?', [id], adminFromRow)
}

/** Get admin by email. */
export async function getAdminByEmail(pool: Pool, email: string): Promise<Admin | null> {
  return selectOne<AdminRow, Admin>(pool, 'SELECT * FROM admins WHERE email = ?', [email.toLowerCase()], adminFromRow)
}

/** List all admins. */
export async function listAdmins(pool: Pool): Promise<Admin[]> {
  return selectMany<AdminRow, Admin>(pool, 'SELECT * FROM admins ORDER BY created_at ASC, id ASC', [], adminFromRow)
}

/** Update admin status. */
export async function updateAdminStatus(pool: Pool, id: string, status: 'active' | 'deactivated'): Promise<void> {
  await pool.execute('UPDATE admins SET status = ? WHERE id = ?', [status, id])
}

/** Update admin password. */
export async function updateAdminPassword(pool: Pool, id: string, hash: string): Promise<void> {
  await pool.execute('UPDATE admins SET password_hash = ? WHERE id = ?', [hash, id])
}

/** Record login timestamp. */
export async function updateAdminLastLogin(pool: Pool, id: string): Promise<void> {
  await pool.execute('UPDATE admins SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [id])
}

/** Create a session. */
export async function insertSession(pool: Pool, adminId: string, expiresAt: string): Promise<string> {
  const id = newId()
  await pool.execute('INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)', [id, adminId, expiresAt])
  return id
}

/** Get a valid (non-expired) session. */
export async function getSession(pool: Pool, sessionId: string): Promise<AdminSession | null> {
  return selectOne<SessionRow, AdminSession>(
    pool,
    'SELECT * FROM admin_sessions WHERE id = ? AND expires_at > UTC_TIMESTAMP(3)',
    [sessionId],
    sessionFromRow,
  )
}

/** Touch session expiry. */
export async function touchSession(pool: Pool, sessionId: string, expiresAt: string): Promise<void> {
  await pool.execute('UPDATE admin_sessions SET expires_at = ? WHERE id = ?', [expiresAt, sessionId])
}

/** Delete a single session. */
export async function deleteSession(pool: Pool, sessionId: string): Promise<void> {
  await pool.execute('DELETE FROM admin_sessions WHERE id = ?', [sessionId])
}

/** Delete all sessions for an admin. */
export async function deleteAdminSessions(pool: Pool, adminId: string, exceptSessionId?: string): Promise<void> {
  if (exceptSessionId !== undefined) {
    await pool.execute('DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?', [adminId, exceptSessionId])
  } else {
    await pool.execute('DELETE FROM admin_sessions WHERE admin_id = ?', [adminId])
  }
}

/** Create a password reset. */
export async function insertPasswordReset(
  pool: Pool,
  adminId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<string> {
  const id = newId()
  await pool.execute('INSERT INTO password_resets (id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)', [
    id,
    adminId,
    tokenHash,
    expiresAt,
  ])
  return id
}

/** Get password reset by token hash. */
export async function getPasswordResetByHash(pool: Pool, tokenHash: string): Promise<PasswordReset | null> {
  return selectOne<PasswordResetRow, PasswordReset>(
    pool,
    'SELECT * FROM password_resets WHERE token_hash = ?',
    [tokenHash],
    resetFromRow,
  )
}

/** Mark a reset as used. */
export async function markPasswordResetUsed(pool: Pool, id: string): Promise<void> {
  await pool.execute('UPDATE password_resets SET used = 1 WHERE id = ?', [id])
}

/** Delete expired sessions and password reset tokens that can no longer authenticate. */
export async function cleanupExpiredAuthState(pool: Pool): Promise<void> {
  await pool.execute('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)')
  await pool.execute('DELETE FROM password_resets WHERE used = 1 OR expires_at <= UTC_TIMESTAMP(3)')
}

/** Insert audit log entry. */
export async function insertAuditEntry(
  pool: Pool,
  adminId: string | null,
  action: string,
  targetId: string | null,
  targetKind: string | null,
  details: string | null,
): Promise<void> {
  const id = newId()
  await pool.execute(
    'INSERT INTO audit_log (id, admin_id, action, target_id, target_kind, details) VALUES (?, ?, ?, ?, ?, ?)',
    [id, adminId, action, targetId, targetKind, details],
  )
}

/** List audit log entries. */
export async function listAuditLog(
  pool: Pool,
  limit: number,
  offset: number,
  filters?: AuditLogFilter,
): Promise<AuditEntryWithEmail[]> {
  const { conditions, params } = buildAuditFilters(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)
  return selectMany<AuditRow, AuditEntryWithEmail>(
    pool,
    `SELECT al.*, a.email AS admin_email FROM audit_log al LEFT JOIN admins a ON al.admin_id = a.id ${where} ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?`,
    params,
    auditFromRow,
  )
}

/** Count audit log entries. */
export async function countAuditLog(pool: Pool, filters?: AuditLogFilter): Promise<number> {
  const { conditions, params } = buildAuditFilters(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return selectCount(pool, `SELECT COUNT(*) AS n FROM audit_log al ${where}`, params)
}

/** List audit log for a specific target. */
export async function listAuditLogForTarget(pool: Pool, targetId: string): Promise<AuditEntryWithEmail[]> {
  return selectMany<AuditRow, AuditEntryWithEmail>(
    pool,
    'SELECT al.*, a.email AS admin_email FROM audit_log al LEFT JOIN admins a ON al.admin_id = a.id WHERE al.target_id = ? ORDER BY al.created_at DESC, al.id DESC',
    [targetId],
    auditFromRow,
  )
}

/** List admin entries (unified posts + reports). */
export async function listAdminEntries(
  pool: Pool,
  limit: number,
  offset: number,
  filters?: AdminEntryFilter & { sort?: 'asc' | 'desc' },
): Promise<AdminEntry[]> {
  const sort = filters?.sort ?? 'desc'
  const parts: string[] = []
  const allParams: (string | number)[] = []
  if (filters?.entryType === undefined || filters.entryType === 'post') {
    const { where, params } = buildEntryFilter('post', filters)
    parts.push(
      `SELECT id, 'post' AS entry_type, status, source,
              CONCAT(first_name, ' from ', city, ', ', country) AS header,
              SUBSTRING(text, 1, 100) AS body_preview,
              NULL AS self_reported_model, created_at
       FROM posts ${where}`,
    )
    allParams.push(...params)
  }
  if (filters?.entryType === undefined || filters.entryType === 'report') {
    const { where, params } = buildEntryFilter('report', filters)
    parts.push(
      `SELECT id, 'report' AS entry_type, status, source,
              CONCAT(reported_first_name, ' from ', reported_city, ', ', reported_country) AS header,
              SUBSTRING(text, 1, 100) AS body_preview,
              self_reported_model, created_at
       FROM reports ${where}`,
    )
    allParams.push(...params)
  }
  allParams.push(limit, offset)
  const direction = sort === 'asc' ? 'ASC' : 'DESC'
  const sql = `${parts.join(' UNION ALL ')} ORDER BY created_at ${direction}, id ${direction} LIMIT ? OFFSET ?`
  return selectMany<AdminEntryRow, AdminEntry>(pool, sql, allParams, adminEntryFromRow)
}

/** Count admin entries matching filters. */
export async function countAdminEntries(pool: Pool, filters?: AdminEntryFilter): Promise<number> {
  let total = 0
  if (filters?.entryType === undefined || filters.entryType === 'post') {
    const { where, params } = buildEntryFilter('post', filters)
    total += await selectCount(pool, `SELECT COUNT(*) AS n FROM posts ${where}`, params)
  }
  if (filters?.entryType === undefined || filters.entryType === 'report') {
    const { where, params } = buildEntryFilter('report', filters)
    total += await selectCount(pool, `SELECT COUNT(*) AS n FROM reports ${where}`, params)
  }
  return total
}

/** Get full admin entry detail. */
export async function getAdminEntryDetail(pool: Pool, id: string): Promise<AdminEntryDetail | null> {
  const post = await selectOne<PostRowLike, PostRowLike>(pool, 'SELECT * FROM posts WHERE id = ?', [id], (r) => r)
  if (post !== null) {
    return {
      id: post.id,
      entryType: 'post',
      status: post.status as EntryStatus,
      source: post.source as EntrySource,
      fields: {
        first_name: post.first_name,
        city: post.city,
        country: post.country,
        text: post.text,
        like_count: post.like_count,
      },
      clientIpHash: post.client_ip_hash,
      selfReportedModel: null,
      createdAt: iso(post.created_at),
    }
  }
  const report = await selectOne<ReportRowLike, ReportRowLike>(
    pool,
    'SELECT * FROM reports WHERE id = ?',
    [id],
    (r) => r,
  )
  if (report !== null) {
    return {
      id: report.id,
      entryType: 'report',
      status: report.status as EntryStatus,
      source: report.source as EntrySource,
      fields: {
        reported_first_name: report.reported_first_name,
        reported_city: report.reported_city,
        reported_country: report.reported_country,
        reporter_first_name: report.reporter_first_name,
        reporter_city: report.reporter_city,
        reporter_country: report.reporter_country,
        text: report.text,
        action_date: isoDate(report.action_date),
        severity: report.severity,
        dislike_count: report.dislike_count,
      },
      clientIpHash: report.client_ip_hash,
      selfReportedModel: report.self_reported_model,
      createdAt: iso(report.created_at),
    }
  }
  return null
}

/** Update entry status. */
export async function updateEntryStatus(
  pool: Pool,
  id: string,
  entryType: 'post' | 'report',
  status: EntryStatus,
): Promise<void> {
  const table = entryType === 'post' ? 'posts' : 'reports'
  await pool.execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, id])
}

/** Permanently delete an entry and its votes. Runs inside a transaction. */
export async function purgeEntry(store: MysqlStore, id: string, entryType: 'post' | 'report'): Promise<void> {
  const table = entryType === 'post' ? 'posts' : 'reports'
  await store.tx(async (conn) => {
    await conn.execute('DELETE FROM votes WHERE entry_id = ? AND entry_kind = ?', [id, entryType])
    await conn.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
  })
}

/** List API keys for admin view. */
export async function listApiKeysAdmin(
  pool: Pool,
  limit: number,
  offset: number,
  statusFilter?: string,
): Promise<AdminApiKey[]> {
  const hasFilter = statusFilter !== undefined && statusFilter !== ''
  const sql = hasFilter
    ? 'SELECT * FROM agent_keys WHERE status = ? ORDER BY issued_at DESC, id DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM agent_keys ORDER BY issued_at DESC, id DESC LIMIT ? OFFSET ?'
  const params: Sqlable[] = hasFilter ? [statusFilter, limit, offset] : [limit, offset]
  return selectMany<ApiKeyRow, AdminApiKey>(pool, sql, params, adminApiKeyFromRow)
}

/** Count API keys. */
export async function countApiKeysAdmin(pool: Pool, statusFilter?: string): Promise<number> {
  if (statusFilter !== undefined && statusFilter !== '') {
    return selectCount(pool, 'SELECT COUNT(*) AS n FROM agent_keys WHERE status = ?', [statusFilter])
  }
  return selectCount(pool, 'SELECT COUNT(*) AS n FROM agent_keys', [])
}

/** Revoke an API key. */
export async function revokeApiKey(pool: Pool, id: string): Promise<void> {
  await pool.execute(`UPDATE agent_keys SET status = 'revoked' WHERE id = ?`, [id])
}

/** List reports submitted with a given API key. */
export async function listReportsForApiKey(pool: Pool, keyHash: string, limit: number): Promise<Report[]> {
  return selectMany<ReportRowLike, Report>(
    pool,
    `SELECT * FROM reports WHERE source = 'api' AND api_key_hash = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [keyHash, limit],
    reportFromRow,
  )
}

/** Get a single API key for admin view. */
export async function getApiKeyAdmin(pool: Pool, id: string): Promise<AdminApiKey | null> {
  return selectOne<ApiKeyRow, AdminApiKey>(pool, 'SELECT * FROM agent_keys WHERE id = ?', [id], adminApiKeyFromRow)
}

// Takedowns + settings live in mysql-store-takedowns.ts and are re-exported
// by mysql-store.ts. Split for the 500-line file cap.
