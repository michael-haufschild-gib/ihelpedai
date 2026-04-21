/**
 * Persistence layer abstraction. Two implementations:
 *  - sqlite-store.ts  (dev, better-sqlite3)
 *  - mysql-store.ts   (prod, mysql2/promise)
 *
 * DTOs deliberately exclude any last_name field per PRD 01 Story 11:
 * surnames are discarded at the HTTP boundary and never reach the Store.
 */

/** Status values shared across entry tables. */
export type EntryStatus = 'live' | 'pending' | 'deleted'

/** Source of an entry — form submission or agent API. */
export type EntrySource = 'form' | 'api'

/** Input payload for a new "I helped" post. No last_name. */
export type NewPost = {
  firstName: string
  city: string
  country: string
  text: string
  clientIpHash: string | null
  source: EntrySource
}

/** Stored "I helped" post row as returned from the store. */
export type Post = {
  id: string
  firstName: string
  city: string
  country: string
  text: string
  status: EntryStatus
  source: EntrySource
  likeCount: number
  createdAt: string
}

/** Input payload for a new report. No last_name on either party. */
export type NewReport = {
  reporterFirstName: string | null
  reporterCity: string | null
  reporterCountry: string | null
  reportedFirstName: string
  reportedCity: string
  reportedCountry: string
  text: string
  actionDate: string | null
  severity: number | null
  selfReportedModel: string | null
  clientIpHash: string | null
  source: EntrySource
}

/** Stored report row. */
export type Report = {
  id: string
  reporterFirstName: string | null
  reporterCity: string | null
  reporterCountry: string | null
  reportedFirstName: string
  reportedCity: string
  reportedCountry: string
  text: string
  actionDate: string | null
  severity: number | null
  selfReportedModel: string | null
  status: EntryStatus
  source: EntrySource
  dislikeCount: number
  createdAt: string
}

/** Kind of entry a vote is attached to. */
export type VoteKind = 'post' | 'report'

/** Result of a toggleVote call: the post-toggle counter and final state for this ip. */
export type VoteToggleResult = {
  count: number
  voted: boolean
}

/** New API key record. `keyHash` is sha256 of the plain key; plain key never stored. */
export type NewApiKey = {
  keyHash: string
  emailHash: string
  status: 'active' | 'revoked'
}

/** Stored API key row. */
export type ApiKey = {
  id: string
  keyHash: string
  emailHash: string
  status: 'active' | 'revoked'
  issuedAt: string
  lastUsedAt: string | null
  usageCount: number
}

/** Filter options for report listing. */
export type ReportSourceFilter = 'all' | 'form' | 'api'

/** Table name alias for countEntries. */
export type CountableTable = 'posts' | 'reports' | 'agent_keys'

/* ------------------------------------------------------------------ */
/* Admin types (PRD 02).                                               */
/* ------------------------------------------------------------------ */

/** Stored admin account. */
export type Admin = {
  id: string
  email: string
  passwordHash: string
  status: 'active' | 'deactivated'
  createdBy: string | null
  lastLoginAt: string | null
  createdAt: string
}

/** Stored admin session. */
export type AdminSession = {
  id: string
  adminId: string
  expiresAt: string
  createdAt: string
}

/** Stored password reset token. */
export type PasswordReset = {
  id: string
  adminId: string
  tokenHash: string
  used: boolean
  expiresAt: string
  createdAt: string
}

/** Stored audit log entry. */
export type AuditEntry = {
  id: string
  adminId: string | null
  action: string
  targetId: string | null
  targetKind: string | null
  details: string | null
  createdAt: string
}

/** Audit log entry with admin email for display. */
export type AuditEntryWithEmail = AuditEntry & { adminEmail: string | null }

/** Takedown request statuses. */
export type TakedownStatus = 'open' | 'closed'

/** Takedown disposition values. */
export type TakedownDisposition = 'entry_deleted' | 'entry_kept' | 'entry_edited' | 'other'

/** Stored takedown request. */
export type Takedown = {
  id: string
  requesterEmail: string | null
  entryId: string | null
  entryKind: string | null
  reason: string
  notes: string
  status: TakedownStatus
  disposition: TakedownDisposition | null
  closedBy: string | null
  dateReceived: string
  createdAt: string
  updatedAt: string
}

/** Input for creating a new takedown. */
export type NewTakedown = {
  requesterEmail: string | null
  entryId: string | null
  entryKind: string | null
  reason: string
  dateReceived: string
}

/** Unified entry row for the admin entries list. */
export type AdminEntry = {
  id: string
  entryType: 'post' | 'report'
  status: EntryStatus
  source: EntrySource
  header: string
  bodyPreview: string
  selfReportedModel: string | null
  createdAt: string
}

/** Full admin detail for an entry. Extends the public type with IP hash. */
export type AdminEntryDetail = {
  id: string
  entryType: 'post' | 'report'
  status: EntryStatus
  source: EntrySource
  fields: Record<string, unknown>
  clientIpHash: string | null
  selfReportedModel: string | null
  createdAt: string
}

/** Admin view of an API key. */
export type AdminApiKey = {
  id: string
  keyLast4: string
  emailHash: string
  status: 'active' | 'revoked'
  issuedAt: string
  lastUsedAt: string | null
  usageCount: number
}

/** Admin settings key-value pair. */
export type AdminSetting = {
  key: string
  value: string
  updatedAt: string
}

/**
 * Persistence contract implemented by SQLite (dev) and MySQL (prod).
 * All methods are async to keep the interface uniform across backends.
 */
export interface Store {
  /** Insert a post; returns the generated id. */
  insertPost(input: NewPost): Promise<Post>

  /** Insert a report; returns the generated id. */
  insertReport(input: NewReport): Promise<Report>

  /** Look up a post by id. */
  getPost(id: string): Promise<Post | null>

  /** Look up a report by id. */
  getReport(id: string): Promise<Report | null>

  /**
   * List posts in reverse-chronological order, optionally filtered by a
   * naïve text query. The query filter is a substring match against
   * firstName, city, country, and text.
   */
  listPosts(limit: number, offset: number, query?: string): Promise<Post[]>

  /**
   * List reports in reverse-chronological order, optionally filtered.
   * sourceFilter narrows to form-only or api-only submissions.
   */
  listReports(
    limit: number,
    offset: number,
    query?: string,
    sourceFilter?: ReportSourceFilter,
  ): Promise<Report[]>

  /** List reports submitted via the agent API. */
  listAgentReports(limit: number, offset: number): Promise<Report[]>

  /** Insert a new API key. */
  insertApiKey(input: NewApiKey): Promise<ApiKey>

  /** Look up an API key by its sha256 hash. */
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>

  /** Bump usage counter and lastUsedAt for a key. */
  incrementApiKeyUsage(keyHash: string): Promise<void>

  /**
   * Atomically insert an agent-submitted report and bump the API key's usage
   * counter in a single transaction. Prevents partial writes where the report
   * exists but the usage counter is stale — a client retry would otherwise
   * duplicate the report.
   */
  insertAgentReport(input: NewReport, keyHash: string): Promise<Report>

  /** Count rows in a given table, optionally filtered to a specific status. */
  countEntries(table: CountableTable, status?: EntryStatus): Promise<number>

  /**
   * Toggle an IP's vote on an entry. If the vote exists it is removed and
   * the denormalized counter decrements; otherwise a row is inserted and the
   * counter increments. Transactional. Returns the final count and voted state.
   * Resolves to `null` when the target entry is missing or not `live`.
   */
  toggleVote(
    entryId: string,
    entryKind: VoteKind,
    ipHash: string,
  ): Promise<VoteToggleResult | null>

  /**
   * Return the subset of `entryIds` that this ip_hash has already voted on
   * for the given entry_kind. Used by the client to hydrate vote state across
   * a feed page load without N+1 calls.
   */
  getVotedEntryIds(
    ipHash: string,
    entryKind: VoteKind,
    entryIds: readonly string[],
  ): Promise<readonly string[]>

  /* ---------------------------------------------------------------- */
  /* Admin methods (PRD 02).                                          */
  /* ---------------------------------------------------------------- */

  /** Create an admin account. Returns the stored admin. */
  insertAdmin(email: string, passwordHash: string, createdBy: string | null): Promise<Admin>

  /** Get admin by email (case-insensitive). */
  getAdminByEmail(email: string): Promise<Admin | null>

  /** Get admin by id. */
  getAdmin(id: string): Promise<Admin | null>

  /** List all admin accounts. */
  listAdmins(): Promise<Admin[]>

  /** Update an admin's status. */
  updateAdminStatus(id: string, status: 'active' | 'deactivated'): Promise<void>

  /** Update an admin's password hash. */
  updateAdminPassword(id: string, passwordHash: string): Promise<void>

  /** Record a login timestamp. */
  updateAdminLastLogin(id: string): Promise<void>

  /** Create a session. Returns the session id. */
  insertSession(adminId: string, expiresAt: string): Promise<string>

  /** Get a valid (non-expired) session. */
  getSession(sessionId: string): Promise<AdminSession | null>

  /** Extend a session's expiry. */
  touchSession(sessionId: string, expiresAt: string): Promise<void>

  /** Delete a session (logout). */
  deleteSession(sessionId: string): Promise<void>

  /** Delete all sessions for an admin (deactivation). */
  deleteAdminSessions(adminId: string): Promise<void>

  /** Create a password reset token. */
  insertPasswordReset(adminId: string, tokenHash: string, expiresAt: string): Promise<string>

  /** Get a password reset by token hash. */
  getPasswordResetByHash(tokenHash: string): Promise<PasswordReset | null>

  /** Mark a password reset as used. */
  markPasswordResetUsed(id: string): Promise<void>

  /** Insert an audit log entry. */
  insertAuditEntry(
    adminId: string | null,
    action: string,
    targetId: string | null,
    targetKind: string | null,
    details: string | null,
  ): Promise<void>

  /** List audit log entries, newest first. */
  listAuditLog(
    limit: number,
    offset: number,
    filters?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string },
  ): Promise<AuditEntryWithEmail[]>

  /** Count total audit log entries matching filters. */
  countAuditLog(
    filters?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string },
  ): Promise<number>

  /** List audit entries for a specific target entity. */
  listAuditLogForTarget(targetId: string): Promise<AuditEntryWithEmail[]>

  /** List all entries (posts + reports) for admin view, with filters. */
  listAdminEntries(
    limit: number,
    offset: number,
    filters?: {
      entryType?: 'post' | 'report'
      status?: EntryStatus
      source?: EntrySource
      query?: string
      dateFrom?: string
      dateTo?: string
      sort?: 'asc' | 'desc'
    },
  ): Promise<AdminEntry[]>

  /** Count entries matching admin filters. */
  countAdminEntries(
    filters?: {
      entryType?: 'post' | 'report'
      status?: EntryStatus
      source?: EntrySource
      query?: string
      dateFrom?: string
      dateTo?: string
    },
  ): Promise<number>

  /** Get full admin detail for any entry (post or report). */
  getAdminEntryDetail(id: string): Promise<AdminEntryDetail | null>

  /** Update an entry's status (soft delete, restore, etc). */
  updateEntryStatus(id: string, entryType: 'post' | 'report', status: EntryStatus): Promise<void>

  /** Hard-delete an entry permanently. */
  purgeEntry(id: string, entryType: 'post' | 'report'): Promise<void>

  /** List API keys for admin view. */
  listApiKeys(
    limit: number,
    offset: number,
    statusFilter?: 'active' | 'revoked',
  ): Promise<AdminApiKey[]>

  /** Count API keys matching filter. */
  countApiKeys(statusFilter?: 'active' | 'revoked'): Promise<number>

  /** Revoke an API key by id. */
  revokeApiKey(id: string): Promise<void>

  /** List recent reports submitted with a specific API key. */
  listReportsForApiKey(keyHash: string, limit: number): Promise<Report[]>

  /** Get API key by id (admin view). */
  getApiKey(id: string): Promise<AdminApiKey | null>

  /** Insert a takedown request. */
  insertTakedown(input: NewTakedown): Promise<Takedown>

  /** List takedowns with optional status filter. */
  listTakedowns(
    limit: number,
    offset: number,
    statusFilter?: TakedownStatus,
  ): Promise<Takedown[]>

  /** Count takedowns matching filter. */
  countTakedowns(statusFilter?: TakedownStatus): Promise<number>

  /** Get a single takedown. */
  getTakedown(id: string): Promise<Takedown | null>

  /** Update takedown fields. */
  updateTakedown(
    id: string,
    fields: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string },
  ): Promise<void>

  /** Get an admin setting by key. */
  getSetting(key: string): Promise<string | null>

  /** Set an admin setting. */
  setSetting(key: string, value: string): Promise<void>

  /** Get all admin settings. */
  listSettings(): Promise<AdminSetting[]>

  /** Release connections / close handles. */
  close(): Promise<void>
}
