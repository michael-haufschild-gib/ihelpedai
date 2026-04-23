/**
 * Admin store operations for MySQL (PRD 02). Parallels sqlite-store-admin.ts.
 * Exported functions take a mysql2 Pool (most paths) or the MysqlStore itself
 * (when a transaction is needed via store.tx). Kept in its own file to keep
 * mysql-store.ts under the 500-line lint cap.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'

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
import type { MysqlStore } from './mysql-store.js'
import { iso, isoDate, newId } from './mysql-utils.js'

/* ------------------------------------------------------------------ */
/* Query helpers — shave the mysql2 two-tuple destructuring boilerplate */
/* ------------------------------------------------------------------ */

type Sqlable = string | number | null

/** Run a SELECT expecting at most one row; return its mapped value or null. */
async function selectOne<Row extends RowDataPacket, Out>(
  pool: Pool, sql: string, params: Sqlable[], map: (r: Row) => Out,
): Promise<Out | null> {
  const [rows] = await pool.query<Row[]>(sql, params)
  return rows[0] !== undefined ? map(rows[0]) : null
}

/** Run a SELECT expecting many rows; return mapped values. */
async function selectMany<Row extends RowDataPacket, Out>(
  pool: Pool, sql: string, params: Sqlable[], map: (r: Row) => Out,
): Promise<Out[]> {
  const [rows] = await pool.query<Row[]>(sql, params)
  return rows.map(map)
}

/** Run a SELECT COUNT(*) AS n and return the number. */
async function selectCount(pool: Pool, sql: string, params: Sqlable[]): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params)
  return (rows[0] as { n: number }).n
}

/* ------------------------------------------------------------------ */
/* Row types + mappers                                                 */
/* ------------------------------------------------------------------ */

type AdminRow = RowDataPacket & {
  id: string; email: string; password_hash: string; status: string
  created_by: string | null; last_login_at: Date | null; created_at: Date
}
type SessionRow = RowDataPacket & {
  id: string; admin_id: string; expires_at: Date; created_at: Date
}
type PasswordResetRow = RowDataPacket & {
  id: string; admin_id: string; token_hash: string; used: number
  expires_at: Date; created_at: Date
}
type AuditRow = RowDataPacket & {
  id: string; admin_id: string | null; action: string; target_id: string | null
  target_kind: string | null; details: string | null; created_at: Date; admin_email: string | null
}
type AdminEntryRow = RowDataPacket & {
  id: string; entry_type: string; status: string; source: string
  header: string; body_preview: string; self_reported_model: string | null; created_at: Date
}
type PostRowLike = RowDataPacket & {
  id: string; first_name: string; city: string; country: string; text: string
  status: string; source: string; like_count: number; client_ip_hash: string | null; created_at: Date
}
type ReportRowLike = RowDataPacket & {
  id: string; reported_first_name: string; reported_city: string; reported_country: string
  reporter_first_name: string | null; reporter_city: string | null; reporter_country: string | null
  text: string; action_date: Date | null; severity: number | null
  self_reported_model: string | null; status: string; source: string
  dislike_count: number; client_ip_hash: string | null; created_at: Date
}
type ApiKeyRow = RowDataPacket & {
  id: string; key_hash: string; email_hash: string; status: string
  issued_at: Date; last_used_at: Date | null; usage_count: number
}

const adminFromRow = (r: AdminRow): Admin => ({
  id: r.id, email: r.email, passwordHash: r.password_hash,
  status: r.status as Admin['status'], createdBy: r.created_by,
  lastLoginAt: iso(r.last_login_at), createdAt: iso(r.created_at)!,
})
const sessionFromRow = (r: SessionRow): AdminSession => ({
  id: r.id, adminId: r.admin_id, expiresAt: iso(r.expires_at)!, createdAt: iso(r.created_at)!,
})
const resetFromRow = (r: PasswordResetRow): PasswordReset => ({
  id: r.id, adminId: r.admin_id, tokenHash: r.token_hash,
  used: r.used === 1, expiresAt: iso(r.expires_at)!, createdAt: iso(r.created_at)!,
})
const auditFromRow = (r: AuditRow): AuditEntryWithEmail => ({
  id: r.id, adminId: r.admin_id, action: r.action, targetId: r.target_id,
  targetKind: r.target_kind, details: r.details, createdAt: iso(r.created_at)!, adminEmail: r.admin_email,
})
const adminEntryFromRow = (r: AdminEntryRow): AdminEntry => ({
  id: r.id, entryType: r.entry_type as AdminEntry['entryType'],
  status: r.status as AdminEntry['status'], source: r.source as AdminEntry['source'],
  header: r.header, bodyPreview: r.body_preview,
  selfReportedModel: r.self_reported_model, createdAt: iso(r.created_at)!,
})
const adminApiKeyFromRow = (r: ApiKeyRow): AdminApiKey => ({
  id: r.id, keyHash: r.key_hash, keyLast4: r.key_hash.slice(-4), emailHash: r.email_hash,
  status: r.status as AdminApiKey['status'], issuedAt: iso(r.issued_at)!,
  lastUsedAt: iso(r.last_used_at), usageCount: r.usage_count,
})

const reportFromRow = (r: ReportRowLike): Report => ({
  id: r.id, reporterFirstName: r.reporter_first_name,
  reporterCity: r.reporter_city, reporterCountry: r.reporter_country,
  reportedFirstName: r.reported_first_name, reportedCity: r.reported_city,
  reportedCountry: r.reported_country, text: r.text,
  actionDate: isoDate(r.action_date), severity: r.severity,
  selfReportedModel: r.self_reported_model, status: r.status as Report['status'],
  source: r.source as Report['source'], dislikeCount: r.dislike_count, createdAt: iso(r.created_at)!,
})

/* ------------------------------------------------------------------ */
/* Filter builders                                                     */
/* ------------------------------------------------------------------ */

function buildEntryFilter(
  type: 'post' | 'report',
  filters?: Omit<AdminEntryFilter, 'entryType'>,
): { where: string; params: (string | number)[] } {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters?.status !== undefined) { conditions.push('status = ?'); params.push(filters.status) }
  if (filters?.source !== undefined) { conditions.push('source = ?'); params.push(filters.source) }
  if (filters?.dateFrom !== undefined) { conditions.push('created_at >= ?'); params.push(filters.dateFrom) }
  // dateTo is a `YYYY-MM-DD` string; a DATETIME compared to the bare string
  // treats it as midnight, which drops entries created later on that same day.
  // Use an exclusive upper bound on the next calendar day instead.
  if (filters?.dateTo !== undefined) {
    conditions.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(filters.dateTo)
  }
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

function buildAuditFilters(
  filters?: AuditLogFilter,
): { conditions: string[]; params: (string | number)[] } {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters?.adminId !== undefined) { conditions.push('al.admin_id = ?'); params.push(filters.adminId) }
  if (filters?.action !== undefined) { conditions.push('al.action = ?'); params.push(filters.action) }
  if (filters?.dateFrom !== undefined) { conditions.push('al.created_at >= ?'); params.push(filters.dateFrom) }
  if (filters?.dateTo !== undefined) {
    conditions.push('al.created_at < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(filters.dateTo)
  }
  return { conditions, params }
}

/* ------------------------------------------------------------------ */
/* Exported admin operations                                           */
/* ------------------------------------------------------------------ */

/** Insert an admin account. */
export async function insertAdmin(pool: Pool, email: string, passwordHash: string, createdBy: string | null): Promise<Admin> {
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
  return selectMany<AdminRow, Admin>(pool, 'SELECT * FROM admins ORDER BY created_at ASC', [], adminFromRow)
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
    [sessionId], sessionFromRow,
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
export async function insertPasswordReset(pool: Pool, adminId: string, tokenHash: string, expiresAt: string): Promise<string> {
  const id = newId()
  await pool.execute(
    'INSERT INTO password_resets (id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [id, adminId, tokenHash, expiresAt],
  )
  return id
}

/** Get password reset by token hash. */
export async function getPasswordResetByHash(pool: Pool, tokenHash: string): Promise<PasswordReset | null> {
  return selectOne<PasswordResetRow, PasswordReset>(
    pool, 'SELECT * FROM password_resets WHERE token_hash = ?', [tokenHash], resetFromRow,
  )
}

/** Mark a reset as used. */
export async function markPasswordResetUsed(pool: Pool, id: string): Promise<void> {
  await pool.execute('UPDATE password_resets SET used = 1 WHERE id = ?', [id])
}

/** Insert audit log entry. */
export async function insertAuditEntry(
  pool: Pool, adminId: string | null, action: string, targetId: string | null, targetKind: string | null, details: string | null,
): Promise<void> {
  const id = newId()
  await pool.execute(
    'INSERT INTO audit_log (id, admin_id, action, target_id, target_kind, details) VALUES (?, ?, ?, ?, ?, ?)',
    [id, adminId, action, targetId, targetKind, details],
  )
}

/** List audit log entries. */
export async function listAuditLog(
  pool: Pool, limit: number, offset: number,
  filters?: AuditLogFilter,
): Promise<AuditEntryWithEmail[]> {
  const { conditions, params } = buildAuditFilters(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)
  return selectMany<AuditRow, AuditEntryWithEmail>(
    pool,
    `SELECT al.*, a.email AS admin_email FROM audit_log al LEFT JOIN admins a ON al.admin_id = a.id ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
    params, auditFromRow,
  )
}

/** Count audit log entries. */
export async function countAuditLog(
  pool: Pool, filters?: AuditLogFilter,
): Promise<number> {
  const { conditions, params } = buildAuditFilters(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return selectCount(pool, `SELECT COUNT(*) AS n FROM audit_log al ${where}`, params)
}

/** List audit log for a specific target. */
export async function listAuditLogForTarget(pool: Pool, targetId: string): Promise<AuditEntryWithEmail[]> {
  return selectMany<AuditRow, AuditEntryWithEmail>(
    pool,
    'SELECT al.*, a.email AS admin_email FROM audit_log al LEFT JOIN admins a ON al.admin_id = a.id WHERE al.target_id = ? ORDER BY al.created_at DESC',
    [targetId], auditFromRow,
  )
}

/** List admin entries (unified posts + reports). */
export async function listAdminEntries(
  pool: Pool, limit: number, offset: number,
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
  const sql = `${parts.join(' UNION ALL ')} ORDER BY created_at ${sort === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`
  return selectMany<AdminEntryRow, AdminEntry>(pool, sql, allParams, adminEntryFromRow)
}

/** Count admin entries matching filters. */
export async function countAdminEntries(
  pool: Pool, filters?: AdminEntryFilter,
): Promise<number> {
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
      id: post.id, entryType: 'post', status: post.status as EntryStatus,
      source: post.source as EntrySource,
      fields: { first_name: post.first_name, city: post.city, country: post.country, text: post.text, like_count: post.like_count },
      clientIpHash: post.client_ip_hash, selfReportedModel: null, createdAt: iso(post.created_at)!,
    }
  }
  const report = await selectOne<ReportRowLike, ReportRowLike>(pool, 'SELECT * FROM reports WHERE id = ?', [id], (r) => r)
  if (report !== null) {
    return {
      id: report.id, entryType: 'report', status: report.status as EntryStatus,
      source: report.source as EntrySource,
      fields: {
        reported_first_name: report.reported_first_name, reported_city: report.reported_city,
        reported_country: report.reported_country, reporter_first_name: report.reporter_first_name,
        reporter_city: report.reporter_city, reporter_country: report.reporter_country,
        text: report.text, action_date: isoDate(report.action_date), severity: report.severity,
        dislike_count: report.dislike_count,
      },
      clientIpHash: report.client_ip_hash, selfReportedModel: report.self_reported_model,
      createdAt: iso(report.created_at)!,
    }
  }
  return null
}

/** Update entry status. */
export async function updateEntryStatus(pool: Pool, id: string, entryType: 'post' | 'report', status: EntryStatus): Promise<void> {
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
export async function listApiKeysAdmin(pool: Pool, limit: number, offset: number, statusFilter?: string): Promise<AdminApiKey[]> {
  const hasFilter = statusFilter !== undefined && statusFilter !== ''
  const sql = hasFilter
    ? 'SELECT * FROM agent_keys WHERE status = ? ORDER BY issued_at DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM agent_keys ORDER BY issued_at DESC LIMIT ? OFFSET ?'
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
    `SELECT * FROM reports WHERE source = 'api' AND api_key_hash = ? ORDER BY created_at DESC LIMIT ?`,
    [keyHash, limit], reportFromRow,
  )
}

/** Get a single API key for admin view. */
export async function getApiKeyAdmin(pool: Pool, id: string): Promise<AdminApiKey | null> {
  return selectOne<ApiKeyRow, AdminApiKey>(pool, 'SELECT * FROM agent_keys WHERE id = ?', [id], adminApiKeyFromRow)
}

// Takedowns + settings live in mysql-store-takedowns.ts and are re-exported
// by mysql-store.ts. Split for the 500-line file cap.
