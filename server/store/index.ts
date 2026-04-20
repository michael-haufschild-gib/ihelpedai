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

  /** Count rows in a given table (for stats / seed-empty check). */
  countEntries(table: CountableTable): Promise<number>

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

  /** Release connections / close handles. */
  close(): Promise<void>
}
