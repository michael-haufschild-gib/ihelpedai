/**
 * Typed fetch wrappers for the admin backoffice API. All requests include
 * credentials so the session cookie is sent automatically.
 *
 * Implementation kernel — request/error envelope/Paginated/buildQuery — lives
 * in {@link ./httpClient}. This module owns endpoint-specific input/response
 * types and binds `credentials: 'include'` to every call.
 */

import {
  ApiError,
  buildQuery,
  jsonBody,
  type Paginated,
  type QueryParams,
  request,
} from './httpClient'

export { type Paginated } from './httpClient'

/**
 * Fired by {@link adminRequest} on 401 responses to a credentialed admin
 * request. Subscribers clear local admin state and show the "session expired"
 * toast; the layout-level useEffect then redirects to /admin/login.
 *
 * A window event is used instead of a direct store import to avoid a
 * circular dependency — adminStore already imports from this module.
 */
export const ADMIN_SESSION_EXPIRED_EVENT = 'ihelpedai:admin-session-expired'

/**
 * Register the custom event on WindowEventMap so `addEventListener` /
 * `dispatchEvent` infer the right signature without per-call casts. The key
 * must be the literal string matching {@link ADMIN_SESSION_EXPIRED_EVENT};
 * TS module augmentation does not accept computed property keys here.
 */
declare global {
  interface WindowEventMap {
    'ihelpedai:admin-session-expired': CustomEvent<void>
  }
}

/** Options for {@link adminRequest}. */
interface AdminRequestOpts {
  /**
   * Dispatch `ADMIN_SESSION_EXPIRED_EVENT` on a 401. Defaults to true; set
   * false for public auth endpoints (login / forgot-password /
   * reset-password) where a 401 means "bad credentials", NOT "session
   * expired". Without this, an incorrect login password would trigger the
   * global toast + /admin/login redirect even though no session existed.
   */
  notifyOnUnauthorized?: boolean
}

/** Execute a JSON request with credentials, throw ApiError on non-2xx. */
async function adminRequest<T>(
  path: string,
  init?: RequestInit,
  opts: AdminRequestOpts = {},
): Promise<T> {
  try {
    return await request<T>(path, { ...init, credentials: 'include' })
  } catch (err) {
    const notify = opts.notifyOnUnauthorized !== false
    if (
      notify &&
      err instanceof ApiError &&
      err.kind === 'unauthorized' &&
      typeof window !== 'undefined'
    ) {
      // Dispatching once per 401 is harmless — subscribers are idempotent and
      // only react when the store actually held a populated admin.
      window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT))
    }
    throw err
  }
}

const jsonPost = (payload: unknown): RequestInit => jsonBody(payload, 'POST')
const jsonPut = (payload: unknown): RequestInit => jsonBody(payload, 'PUT')
const jsonPatch = (payload: unknown): RequestInit => jsonBody(payload, 'PATCH')

/** Build query string from params; null + undefined entries are skipped. */
function qs<T extends QueryParams<T>>(params: T): string {
  return buildQuery(params)
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

/** Admin user info. */
export interface AdminUser {
  id: string
  email: string
}

/** Login response. */
export interface LoginResponse {
  status: string
  admin: AdminUser
}

/** Log in with email + password. */
export function login(email: string, password: string): Promise<LoginResponse> {
  return adminRequest<LoginResponse>(
    '/api/admin/login',
    jsonPost({ email, password }),
    { notifyOnUnauthorized: false },
  )
}

/** Log out (invalidate session). */
export function logout(): Promise<void> {
  return adminRequest<void>('/api/admin/logout', { method: 'POST' })
}

/** Get current authenticated admin. */
export function getMe(): Promise<AdminUser & { status: string }> {
  return adminRequest('/api/admin/me')
}

/** Request password reset. */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return adminRequest(
    '/api/admin/forgot-password',
    jsonPost({ email }),
    { notifyOnUnauthorized: false },
  )
}

/** Reset password with token. */
export function resetPassword(token: string, password: string, confirmPassword: string): Promise<{ message: string }> {
  return adminRequest(
    '/api/admin/reset-password',
    jsonPost({ token, password, confirm_password: confirmPassword }),
    { notifyOnUnauthorized: false },
  )
}

/** Change password (authenticated). */
export function changePassword(currentPassword: string, newPassword: string): Promise<{ status: string }> {
  return adminRequest('/api/admin/change-password', jsonPost({ current_password: currentPassword, new_password: newPassword }))
}

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

/** Admin entry in list view. */
export interface AdminEntry {
  id: string
  entryType: 'post' | 'report'
  status: 'live' | 'pending' | 'deleted'
  source: 'form' | 'api'
  header: string
  bodyPreview: string
  selfReportedModel: string | null
  createdAt: string
}

/** Entry list filters. */
export interface EntryFilters {
  entry_type?: 'post' | 'report'
  status?: 'live' | 'pending' | 'deleted'
  source?: 'form' | 'api'
  q?: string
  date_from?: string
  date_to?: string
  sort?: 'asc' | 'desc'
  page?: number
}

/** List entries with filters. */
export function listEntries(filters: EntryFilters = {}): Promise<Paginated<AdminEntry>> {
  return adminRequest(`/api/admin/entries${qs(filters)}`)
}

/** Admin entry detail. */
export interface AdminEntryDetail {
  id: string
  entryType: 'post' | 'report'
  status: 'live' | 'pending' | 'deleted'
  source: 'form' | 'api'
  fields: Record<string, unknown>
  clientIpHash: string | null
  selfReportedModel: string | null
  createdAt: string
  audit_log: AuditEntry[]
}

/** Get entry detail. */
export function getEntry(id: string): Promise<AdminEntryDetail> {
  return adminRequest(`/api/admin/entries/${encodeURIComponent(id)}`)
}

/** Perform an action on an entry. */
export function entryAction(id: string, action: string, reason?: string): Promise<{ status: string }> {
  return adminRequest(`/api/admin/entries/${encodeURIComponent(id)}/action`, jsonPost({ action, reason }))
}

/** Purge an entry permanently. */
export function purgeEntry(id: string, confirmation: string, reason?: string): Promise<{ status: string }> {
  return adminRequest(`/api/admin/entries/${encodeURIComponent(id)}/purge`, jsonPost({ confirmation, reason }))
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

/** List pending queue items. */
export function listQueue(page?: number): Promise<Paginated<AdminEntry>> {
  return adminRequest(`/api/admin/queue${qs({ page })}`)
}

/** Get queue count. */
export function getQueueCount(): Promise<{ count: number }> {
  return adminRequest('/api/admin/queue/count')
}

/** Act on a queue item. */
export function queueAction(id: string, action: 'approve' | 'reject', reason?: string): Promise<{ status: string }> {
  return adminRequest(`/api/admin/queue/${encodeURIComponent(id)}/action`, jsonPost({ action, reason }))
}

/** Bulk queue action. */
export function bulkQueueAction(ids: string[], action: 'approve' | 'reject', reason?: string): Promise<{ status: string; results: { id: string; ok: boolean }[] }> {
  return adminRequest('/api/admin/queue/bulk', jsonPost({ ids, action, reason }))
}

/* ------------------------------------------------------------------ */
/* API Keys                                                            */
/* ------------------------------------------------------------------ */

/** Admin view of API key. */
export interface AdminApiKey {
  id: string
  keyLast4: string
  emailHash: string
  status: 'active' | 'revoked'
  issuedAt: string
  lastUsedAt: string | null
  usageCount: number
}

/** List API keys. */
export function listApiKeys(opts: { status?: 'active' | 'revoked'; page?: number } = {}): Promise<Paginated<AdminApiKey>> {
  return adminRequest(`/api/admin/api-keys${qs(opts)}`)
}

/** Get API key detail with recent reports. */
export function getApiKey(id: string): Promise<AdminApiKey & { recent_reports: unknown[] }> {
  return adminRequest(`/api/admin/api-keys/${encodeURIComponent(id)}`)
}

/** Revoke an API key. */
export function revokeApiKey(id: string, reason?: string): Promise<{ status: string }> {
  return adminRequest(`/api/admin/api-keys/${encodeURIComponent(id)}/revoke`, jsonPost({ confirmation: 'REVOKE', reason }))
}

/* ------------------------------------------------------------------ */
/* Takedowns                                                           */
/* ------------------------------------------------------------------ */

/** Takedown request. */
export interface AdminTakedown {
  id: string
  requesterEmail: string | null
  entryId: string | null
  entryKind: string | null
  reason: string
  notes: string
  status: 'open' | 'closed'
  disposition: string | null
  closedBy: string | null
  dateReceived: string
  createdAt: string
  updatedAt: string
}

/** List takedowns. */
export function listTakedowns(opts: { status?: 'open' | 'closed'; page?: number } = {}): Promise<Paginated<AdminTakedown>> {
  return adminRequest(`/api/admin/takedowns${qs(opts)}`)
}

/** Get takedown detail. */
export function getTakedown(id: string): Promise<AdminTakedown> {
  return adminRequest(`/api/admin/takedowns/${encodeURIComponent(id)}`)
}

/** Create takedown. */
export function createTakedown(input: {
  requester_email?: string | null
  entry_id?: string | null
  entry_kind?: 'post' | 'report' | null
  reason: string
  date_received: string
}): Promise<AdminTakedown> {
  return adminRequest('/api/admin/takedowns', jsonPost(input))
}

/** Update takedown. */
export function updateTakedown(id: string, fields: {
  status?: 'open' | 'closed'
  disposition?: string
  notes?: string
}): Promise<AdminTakedown> {
  return adminRequest(`/api/admin/takedowns/${encodeURIComponent(id)}`, jsonPatch(fields))
}

/* ------------------------------------------------------------------ */
/* Admins                                                              */
/* ------------------------------------------------------------------ */

/** Admin account. */
export interface AdminAccount {
  id: string
  email: string
  status: 'active' | 'deactivated'
  createdBy: string | null
  lastLoginAt: string | null
  createdAt: string
}

/** List admin accounts. */
export function listAdmins(): Promise<{ items: AdminAccount[] }> {
  return adminRequest('/api/admin/admins')
}

/** Invite new admin. */
export function inviteAdmin(email: string): Promise<{ status: string; id: string }> {
  return adminRequest('/api/admin/admins/invite', jsonPost({ email }))
}

/** Deactivate admin. */
export function deactivateAdmin(id: string, reason?: string): Promise<{ status: string }> {
  return adminRequest(`/api/admin/admins/${encodeURIComponent(id)}/deactivate`, jsonPost({ reason }))
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

/** Audit log entry. */
export interface AuditEntry {
  id: string
  adminId: string | null
  action: string
  targetId: string | null
  targetKind: string | null
  details: string | null
  createdAt: string
  adminEmail: string | null
}

/** List audit log entries. */
export function listAuditLog(opts: {
  admin_id?: string
  action?: string
  date_from?: string
  date_to?: string
  page?: number
} = {}): Promise<Paginated<AuditEntry>> {
  return adminRequest(`/api/admin/audit${qs(opts)}`)
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/** Admin settings map. */
export interface AdminSettings {
  auto_publish_agents: string
  submission_freeze: string
  sanitizer_exceptions: string
}

/** Get all settings. */
export function getSettings(): Promise<AdminSettings> {
  return adminRequest('/api/admin/settings')
}

/** Update a setting. */
export function updateSetting(key: keyof AdminSettings, value: string): Promise<{ status: string }> {
  return adminRequest('/api/admin/settings', jsonPut({ key, value }))
}
