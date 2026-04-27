/**
 * Row types, row → DTO mappers, query helpers, and WHERE-clause builders
 * shared by the MySQL admin store. Kept apart from mysql-store-admin.ts so
 * that file stays under the 500-line lint cap.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'

import { buildContainsLikePattern } from '../lib/like-pattern.js'

import type {
  Admin,
  AdminApiKey,
  AdminEntry,
  AdminEntryFilter,
  AdminSession,
  AuditEntryWithEmail,
  AuditLogFilter,
  PasswordReset,
  Report,
} from './index.js'
import { iso, isoDate } from './mysql-utils.js'

/** Bound parameter values supported by mysql2's prepared statements. */
export type Sqlable = string | number | null

/** Run a SELECT expecting at most one row; return its mapped value or null. */
export async function selectOne<Row extends RowDataPacket, Out>(
  pool: Pool,
  sql: string,
  params: Sqlable[],
  map: (r: Row) => Out,
): Promise<Out | null> {
  const [rows] = await pool.query<Row[]>(sql, params)
  return rows[0] !== undefined ? map(rows[0]) : null
}

/** Run a SELECT expecting many rows; return mapped values. */
export async function selectMany<Row extends RowDataPacket, Out>(
  pool: Pool,
  sql: string,
  params: Sqlable[],
  map: (r: Row) => Out,
): Promise<Out[]> {
  const [rows] = await pool.query<Row[]>(sql, params)
  return rows.map(map)
}

/** Run a SELECT COUNT(*) AS n and return the number. */
export async function selectCount(pool: Pool, sql: string, params: Sqlable[]): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params)
  const row = rows[0] as { n: number } | undefined
  if (row === undefined) throw new Error('selectCount: count row not returned')
  return row.n
}

/** Raw row shape returned by `SELECT * FROM admins`. */
export type AdminRow = RowDataPacket & {
  id: string
  email: string
  password_hash: string
  status: string
  created_by: string | null
  last_login_at: Date | null
  created_at: Date
}
/** Raw row shape returned by `SELECT * FROM admin_sessions`. */
export type SessionRow = RowDataPacket & {
  id: string
  admin_id: string
  expires_at: Date
  created_at: Date
}
/** Raw row shape returned by `SELECT * FROM password_resets`. */
export type PasswordResetRow = RowDataPacket & {
  id: string
  admin_id: string
  token_hash: string
  used: number
  expires_at: Date
  created_at: Date
}
/** Raw row shape returned by audit log SELECTs (with admin email join). */
export type AuditRow = RowDataPacket & {
  id: string
  admin_id: string | null
  action: string
  target_id: string | null
  target_kind: string | null
  details: string | null
  created_at: Date
  admin_email: string | null
}
/** Raw row shape used by the unified posts/reports admin listing query. */
export type AdminEntryRow = RowDataPacket & {
  id: string
  entry_type: string
  status: string
  source: string
  header: string
  body_preview: string
  self_reported_model: string | null
  created_at: Date
}
/** Subset of post columns needed for admin entry detail rendering. */
export type PostRowLike = RowDataPacket & {
  id: string
  first_name: string
  city: string
  country: string
  text: string
  status: string
  source: string
  like_count: number
  client_ip_hash: string | null
  created_at: Date
}
/** Subset of report columns needed for admin entry detail rendering. */
export type ReportRowLike = RowDataPacket & {
  id: string
  reported_first_name: string
  reported_city: string
  reported_country: string
  reporter_first_name: string | null
  reporter_city: string | null
  reporter_country: string | null
  text: string
  action_date: Date | null
  severity: number | null
  self_reported_model: string | null
  status: string
  source: string
  dislike_count: number
  client_ip_hash: string | null
  created_at: Date
}
/** Raw row shape returned by `SELECT * FROM agent_keys`. */
export type ApiKeyRow = RowDataPacket & {
  id: string
  key_hash: string
  key_last4: string
  email_hash: string
  status: string
  issued_at: Date
  last_used_at: Date | null
  usage_count: number
}

export const adminFromRow = (r: AdminRow): Admin => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  status: r.status as Admin['status'],
  createdBy: r.created_by,
  lastLoginAt: iso(r.last_login_at),
  createdAt: iso(r.created_at),
})
export const sessionFromRow = (r: SessionRow): AdminSession => ({
  id: r.id,
  adminId: r.admin_id,
  expiresAt: iso(r.expires_at),
  createdAt: iso(r.created_at),
})
export const resetFromRow = (r: PasswordResetRow): PasswordReset => ({
  id: r.id,
  adminId: r.admin_id,
  tokenHash: r.token_hash,
  used: r.used === 1,
  expiresAt: iso(r.expires_at),
  createdAt: iso(r.created_at),
})
export const auditFromRow = (r: AuditRow): AuditEntryWithEmail => ({
  id: r.id,
  adminId: r.admin_id,
  action: r.action,
  targetId: r.target_id,
  targetKind: r.target_kind,
  details: r.details,
  createdAt: iso(r.created_at),
  adminEmail: r.admin_email,
})
export const adminEntryFromRow = (r: AdminEntryRow): AdminEntry => ({
  id: r.id,
  entryType: r.entry_type as AdminEntry['entryType'],
  status: r.status as AdminEntry['status'],
  source: r.source as AdminEntry['source'],
  header: r.header,
  bodyPreview: r.body_preview,
  selfReportedModel: r.self_reported_model,
  createdAt: iso(r.created_at),
})
export const adminApiKeyFromRow = (r: ApiKeyRow): AdminApiKey => ({
  id: r.id,
  keyHash: r.key_hash,
  keyLast4: r.key_last4,
  emailHash: r.email_hash,
  status: r.status as AdminApiKey['status'],
  issuedAt: iso(r.issued_at),
  lastUsedAt: iso(r.last_used_at),
  usageCount: r.usage_count,
})
export const reportFromRow = (r: ReportRowLike): Report => ({
  id: r.id,
  reporterFirstName: r.reporter_first_name,
  reporterCity: r.reporter_city,
  reporterCountry: r.reporter_country,
  reportedFirstName: r.reported_first_name,
  reportedCity: r.reported_city,
  reportedCountry: r.reported_country,
  text: r.text,
  actionDate: isoDate(r.action_date),
  severity: r.severity,
  selfReportedModel: r.self_reported_model,
  status: r.status as Report['status'],
  source: r.source as Report['source'],
  dislikeCount: r.dislike_count,
  createdAt: iso(r.created_at),
})

/** Build WHERE clause for admin entry listing. */
export function buildEntryFilter(
  type: 'post' | 'report',
  filters?: Omit<AdminEntryFilter, 'entryType'>,
): { where: string; params: (string | number)[] } {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters?.status !== undefined) {
    conditions.push('status = ?')
    params.push(filters.status)
  }
  if (filters?.source !== undefined) {
    conditions.push('source = ?')
    params.push(filters.source)
  }
  if (filters?.dateFrom !== undefined) {
    conditions.push('created_at >= ?')
    params.push(filters.dateFrom)
  }
  // dateTo is a `YYYY-MM-DD` string; a DATETIME compared to the bare string
  // treats it as midnight, which drops entries created later on that same
  // day. Use an exclusive upper bound on the next calendar day instead.
  if (filters?.dateTo !== undefined) {
    conditions.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(filters.dateTo)
  }
  if (filters?.query !== undefined && filters.query !== '') {
    const q = buildContainsLikePattern(filters.query)
    if (type === 'post') {
      conditions.push(
        "(first_name LIKE ? ESCAPE '\\\\' OR city LIKE ? ESCAPE '\\\\' OR country LIKE ? ESCAPE '\\\\' OR text LIKE ? ESCAPE '\\\\')",
      )
    } else {
      conditions.push(
        "(reported_first_name LIKE ? ESCAPE '\\\\' OR reported_city LIKE ? ESCAPE '\\\\' OR reported_country LIKE ? ESCAPE '\\\\' OR text LIKE ? ESCAPE '\\\\')",
      )
    }
    params.push(q, q, q, q)
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

/** Build WHERE clause for audit log filters. */
export function buildAuditFilters(filters?: AuditLogFilter): {
  conditions: string[]
  params: (string | number)[]
} {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters?.adminId !== undefined) {
    conditions.push('al.admin_id = ?')
    params.push(filters.adminId)
  }
  if (filters?.action !== undefined) {
    conditions.push('al.action = ?')
    params.push(filters.action)
  }
  if (filters?.dateFrom !== undefined) {
    conditions.push('al.created_at >= ?')
    params.push(filters.dateFrom)
  }
  if (filters?.dateTo !== undefined) {
    conditions.push('al.created_at < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(filters.dateTo)
  }
  return { conditions, params }
}
