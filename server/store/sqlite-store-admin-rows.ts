/**
 * Row types, row → DTO mappers, and WHERE-clause builders shared by the
 * SQLite admin store. Lives apart from sqlite-store-admin.ts so that file
 * stays under the 500-line lint cap.
 */
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
  Takedown,
} from './index.js'
import { takedownEntryKindFromDb } from './takedown-entry-kind.js'

/** Raw row shape returned by `SELECT * FROM admins` in better-sqlite3. */
export type AdminRow = {
  id: string
  email: string
  password_hash: string
  status: string
  created_by: string | null
  last_login_at: string | null
  created_at: string
}
/** Raw row shape returned by `SELECT * FROM admin_sessions`. */
export type SessionRow = { id: string; admin_id: string; expires_at: string; created_at: string }
/** Raw row shape returned by `SELECT * FROM password_resets`. */
export type PasswordResetRow = {
  id: string
  admin_id: string
  token_hash: string
  used: number
  expires_at: string
  created_at: string
}
/** Raw row shape returned by audit log SELECTs (with admin email join). */
export type AuditRow = {
  id: string
  admin_id: string | null
  action: string
  target_id: string | null
  target_kind: string | null
  details: string | null
  created_at: string
  admin_email: string | null
}
/** Raw row shape returned by `SELECT * FROM takedowns`. */
export type TakedownRow = {
  id: string
  requester_email: string | null
  entry_id: string | null
  entry_kind: string | null
  reason: string
  notes: string
  status: string
  disposition: string | null
  closed_by: string | null
  date_received: string
  created_at: string
  updated_at: string
}
/** Raw row shape used by the unified posts/reports admin listing query. */
export type AdminEntryRow = {
  id: string
  entry_type: string
  status: string
  source: string
  header: string
  body_preview: string
  self_reported_model: string | null
  created_at: string
}
/** Subset of post columns needed for admin entry detail rendering. */
export type PostRowLike = {
  id: string
  first_name: string
  city: string
  country: string
  text: string
  status: string
  source: string
  like_count: number
  client_ip_hash: string | null
  created_at: string
}
/** Subset of report columns needed for admin entry detail rendering. */
export type ReportRowLike = {
  id: string
  reported_first_name: string
  reported_city: string
  reported_country: string
  reporter_first_name: string | null
  reporter_city: string | null
  reporter_country: string | null
  text: string
  action_date: string | null
  severity: number | null
  self_reported_model: string | null
  status: string
  source: string
  dislike_count: number
  client_ip_hash: string | null
  created_at: string
}
/** Raw row shape returned by `SELECT * FROM agent_keys`. */
export type ApiKeyRow = {
  id: string
  key_hash: string
  key_last4: string
  email_hash: string
  status: string
  issued_at: string
  last_used_at: string | null
  usage_count: number
}

export const adminFromRow = (r: AdminRow): Admin => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  status: r.status as Admin['status'],
  createdBy: r.created_by,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
})
export const sessionFromRow = (r: SessionRow): AdminSession => ({
  id: r.id,
  adminId: r.admin_id,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
})
export const resetFromRow = (r: PasswordResetRow): PasswordReset => ({
  id: r.id,
  adminId: r.admin_id,
  tokenHash: r.token_hash,
  used: r.used === 1,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
})
export const auditFromRow = (r: AuditRow): AuditEntryWithEmail => ({
  id: r.id,
  adminId: r.admin_id,
  action: r.action,
  targetId: r.target_id,
  targetKind: r.target_kind,
  details: r.details,
  createdAt: r.created_at,
  adminEmail: r.admin_email,
})
export const takedownFromRow = (r: TakedownRow): Takedown => ({
  id: r.id,
  requesterEmail: r.requester_email,
  entryId: r.entry_id,
  entryKind: takedownEntryKindFromDb(r.entry_kind),
  reason: r.reason,
  notes: r.notes,
  status: r.status as Takedown['status'],
  disposition: r.disposition as Takedown['disposition'],
  closedBy: r.closed_by,
  dateReceived: r.date_received,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})
export const adminEntryFromRow = (r: AdminEntryRow): AdminEntry => ({
  id: r.id,
  entryType: r.entry_type as AdminEntry['entryType'],
  status: r.status as AdminEntry['status'],
  source: r.source as AdminEntry['source'],
  header: r.header,
  bodyPreview: r.body_preview,
  selfReportedModel: r.self_reported_model,
  createdAt: r.created_at,
})
export const adminApiKeyFromRow = (r: ApiKeyRow): AdminApiKey => ({
  id: r.id,
  keyHash: r.key_hash,
  keyLast4: r.key_last4,
  emailHash: r.email_hash,
  status: r.status as AdminApiKey['status'],
  issuedAt: r.issued_at,
  lastUsedAt: r.last_used_at,
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
  actionDate: r.action_date,
  severity: r.severity,
  selfReportedModel: r.self_reported_model,
  status: r.status as Report['status'],
  source: r.source as Report['source'],
  dislikeCount: r.dislike_count,
  createdAt: r.created_at,
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
  // dateTo is a bare YYYY-MM-DD; created_at is 'YYYY-MM-DDTHH:MM:SS.mmmZ'.
  // A lexicographic `<= dateTo` drops any row created later on that same
  // day. Use an exclusive upper bound on the next calendar day to mirror
  // the MySQL DATE_ADD(?, INTERVAL 1 DAY) path.
  if (filters?.dateTo !== undefined) {
    conditions.push(`created_at < date(?, '+1 day')`)
    params.push(filters.dateTo)
  }
  if (filters?.query !== undefined && filters.query !== '') {
    const q = buildContainsLikePattern(filters.query)
    if (type === 'post') {
      conditions.push(
        "(first_name LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR country LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')",
      )
    } else {
      conditions.push(
        "(reported_first_name LIKE ? ESCAPE '\\' OR reported_city LIKE ? ESCAPE '\\' OR reported_country LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')",
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
  // See buildEntryFilter: inclusive-day dateTo via next-day exclusive bound.
  if (filters?.dateTo !== undefined) {
    conditions.push(`al.created_at < date(?, '+1 day')`)
    params.push(filters.dateTo)
  }
  return { conditions, params }
}
