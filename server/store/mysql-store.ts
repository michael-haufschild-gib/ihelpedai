import { customAlphabet } from 'nanoid'
import mysql from 'mysql2/promise'
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise'

import type {
  Admin,
  AdminApiKey,
  AdminEntry,
  AdminEntryDetail,
  AdminSession,
  AdminSetting,
  ApiKey,
  AuditEntryWithEmail,
  CountableTable,
  EntrySource,
  EntryStatus,
  NewApiKey,
  NewPost,
  NewReport,
  NewTakedown,
  PasswordReset,
  Post,
  Report,
  ReportSourceFilter,
  Store,
  Takedown,
  TakedownDisposition,
  TakedownStatus,
  VoteKind,
  VoteToggleResult,
} from './index.js'
import * as adm from './mysql-store-admin.js'
import * as td from './mysql-store-takedowns.js'

const ID_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const newId = customAlphabet(ID_ALPHABET, 10)

type PostRow = RowDataPacket & {
  id: string
  first_name: string
  city: string
  country: string
  text: string
  status: string
  source: string
  like_count: number
  created_at: Date
}

type ReportRow = RowDataPacket & {
  id: string
  reporter_first_name: string | null
  reporter_city: string | null
  reporter_country: string | null
  reported_first_name: string
  reported_city: string
  reported_country: string
  text: string
  action_date: Date | null
  severity: number | null
  self_reported_model: string | null
  status: string
  source: string
  dislike_count: number
  created_at: Date
}

type ApiKeyRow = RowDataPacket & {
  id: string
  key_hash: string
  email_hash: string
  status: string
  issued_at: Date
  last_used_at: Date | null
  usage_count: number
}

/** UTC ISO-8601 string with ms precision ("…Z"), matching the SqliteStore output. */
function iso(d: Date | null): string | null {
  return d === null ? null : d.toISOString()
}

/** Render an action_date column (DATE column → YYYY-MM-DD) without TZ drift. */
function isoDate(d: Date | null): string | null {
  if (d === null) return null
  // mysql2 returns DATE columns as Date objects at midnight UTC; take the
  // first 10 chars of the ISO string to drop the time portion.
  return d.toISOString().slice(0, 10)
}

const postFromRow = (r: PostRow): Post => ({
  id: r.id,
  firstName: r.first_name,
  city: r.city,
  country: r.country,
  text: r.text,
  status: r.status as Post['status'],
  source: r.source as Post['source'],
  likeCount: r.like_count,
  createdAt: iso(r.created_at)!,
})

const reportFromRow = (r: ReportRow): Report => ({
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
  createdAt: iso(r.created_at)!,
})

const apiKeyFromRow = (r: ApiKeyRow): ApiKey => ({
  id: r.id,
  keyHash: r.key_hash,
  emailHash: r.email_hash,
  status: r.status as ApiKey['status'],
  issuedAt: iso(r.issued_at)!,
  lastUsedAt: iso(r.last_used_at),
  usageCount: r.usage_count,
})

/** Re-export for the admin delegate so it shares the same id alphabet. */
export { newId as newMysqlId, iso as isoTimestamp, isoDate as isoDateOnly }

/**
 * Production Store backed by MySQL 8 via mysql2/promise.
 * Admin methods are delegated to mysql-store-admin.ts to stay under the
 * 500-line file cap (docs/meta/styleguide.md).
 */
export class MysqlStore implements Store {
  private readonly pool: Pool

  constructor(url: string) {
    if (url === '') throw new Error('MysqlStore: MYSQL_URL is required')
    // `timezone: 'Z'` configures mysql2 to (de)serialize JS Date ⇄ MySQL DATETIME
    // as UTC. An onConnection handler (below) also aligns the SERVER session
    // time_zone so DEFAULT CURRENT_TIMESTAMP() values land in UTC.
    this.pool = mysql.createPool({
      uri: url,
      connectionLimit: 10,
      timezone: 'Z',
      decimalNumbers: true,
    })
    this.pool.on('connection', (conn) => {
      // `pool.on('connection')` hands back the raw callback-style Connection,
      // not the promise wrapper — so use the callback form here. If the SET
      // fails the next real query will too, so the error is not lost.
      // The TS types on the promise wrapper mis-describe this event's payload;
      // a minimal local type captures the callback-style `query` signature.
      const cb = conn as unknown as { query(sql: string, done: () => void): unknown }
      cb.query("SET time_zone='+00:00'", () => { /* swallow */ })
    })
  }

  /** Run `fn` inside a transaction with automatic commit / rollback / release. */
  private async withTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      const out = await fn(conn)
      await conn.commit()
      return out
    } catch (err) {
      try { await conn.rollback() } catch { /* surface original */ }
      throw err
    } finally {
      conn.release()
    }
  }

  /** Expose the pool for the admin delegate (same store, one pool). */
  getPool(): Pool {
    return this.pool
  }

  /** Run `fn` in a transaction and return its value. Exposed for admin delegate. */
  tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    return this.withTx(fn)
  }

  async insertPost(input: NewPost): Promise<Post> {
    const id = newId()
    await this.pool.execute(
      `INSERT INTO posts (id, first_name, city, country, text, status, source, client_ip_hash)
       VALUES (?, ?, ?, ?, ?, 'live', ?, ?)`,
      [id, input.firstName, input.city, input.country, input.text, input.source, input.clientIpHash],
    )
    const [rows] = await this.pool.query<PostRow[]>('SELECT * FROM posts WHERE id = ?', [id])
    return postFromRow(rows[0])
  }

  async insertReport(input: NewReport): Promise<Report> {
    const id = newId()
    await this.pool.execute(
      `INSERT INTO reports (
        id, reporter_first_name, reporter_city, reporter_country,
        reported_first_name, reported_city, reported_country, text,
        action_date, severity, self_reported_model, status, source, client_ip_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)`,
      [
        id, input.reporterFirstName, input.reporterCity, input.reporterCountry,
        input.reportedFirstName, input.reportedCity, input.reportedCountry, input.text,
        input.actionDate, input.severity, input.selfReportedModel, input.source, input.clientIpHash,
      ],
    )
    const [rows] = await this.pool.query<ReportRow[]>('SELECT * FROM reports WHERE id = ?', [id])
    return reportFromRow(rows[0])
  }

  async getPost(id: string): Promise<Post | null> {
    const [rows] = await this.pool.query<PostRow[]>('SELECT * FROM posts WHERE id = ?', [id])
    return rows[0] !== undefined ? postFromRow(rows[0]) : null
  }

  async getReport(id: string): Promise<Report | null> {
    const [rows] = await this.pool.query<ReportRow[]>('SELECT * FROM reports WHERE id = ?', [id])
    return rows[0] !== undefined ? reportFromRow(rows[0]) : null
  }

  async getPostsByIds(ids: readonly string[]): Promise<Post[]> {
    if (ids.length === 0) return []
    // Enforce `status = 'live'` to match listPosts — the search index may lag
    // a status transition, so ids can point at pending/deleted rows.
    const [rows] = await this.pool.query<PostRow[]>(
      "SELECT * FROM posts WHERE status = 'live' AND id IN (?)",
      [ids],
    )
    const byId = new Map<string, Post>()
    for (const row of rows) byId.set(row.id, postFromRow(row))
    return ids.map((id) => byId.get(id)).filter((p): p is Post => p !== undefined)
  }

  async getReportsByIds(ids: readonly string[]): Promise<Report[]> {
    if (ids.length === 0) return []
    const [rows] = await this.pool.query<ReportRow[]>(
      "SELECT * FROM reports WHERE status = 'live' AND id IN (?)",
      [ids],
    )
    const byId = new Map<string, Report>()
    for (const row of rows) byId.set(row.id, reportFromRow(row))
    return ids.map((id) => byId.get(id)).filter((r): r is Report => r !== undefined)
  }

  async listPosts(limit: number, offset: number, query?: string): Promise<Post[]> {
    const hasQuery = typeof query === 'string' && query.trim() !== ''
    // `id DESC` as a deterministic tie-breaker. Without it, rows sharing the
    // same millisecond `created_at` can reshuffle between pages and produce
    // duplicates/skips across LIMIT/OFFSET requests.
    const [rows] = hasQuery
      ? await this.pool.query<PostRow[]>(
          `SELECT * FROM posts
           WHERE status = 'live'
             AND (first_name LIKE ? OR city LIKE ? OR country LIKE ? OR text LIKE ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
          [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit, offset],
        )
      : await this.pool.query<PostRow[]>(
          `SELECT * FROM posts WHERE status = 'live' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
          [limit, offset],
        )
    return rows.map(postFromRow)
  }

  async listReports(
    limit: number,
    offset: number,
    query?: string,
    sourceFilter: ReportSourceFilter = 'all',
  ): Promise<Report[]> {
    const conditions: string[] = [`status = 'live'`]
    const params: (string | number)[] = []
    if (sourceFilter !== 'all') {
      conditions.push('source = ?')
      params.push(sourceFilter)
    }
    if (typeof query === 'string' && query.trim() !== '') {
      conditions.push('(reported_first_name LIKE ? OR reported_city LIKE ? OR reported_country LIKE ? OR text LIKE ? OR reporter_first_name LIKE ?)')
      const q = `%${query}%`
      params.push(q, q, q, q, q)
    }
    params.push(limit, offset)
    const [rows] = await this.pool.query<ReportRow[]>(
      `SELECT * FROM reports WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      params,
    )
    return rows.map(reportFromRow)
  }

  async listAgentReports(limit: number, offset: number): Promise<Report[]> {
    return this.listReports(limit, offset, undefined, 'api')
  }

  async insertApiKey(input: NewApiKey): Promise<ApiKey> {
    const id = newId()
    await this.pool.execute(
      'INSERT INTO agent_keys (id, key_hash, email_hash, status) VALUES (?, ?, ?, ?)',
      [id, input.keyHash, input.emailHash, input.status],
    )
    const [rows] = await this.pool.query<ApiKeyRow[]>('SELECT * FROM agent_keys WHERE id = ?', [id])
    return apiKeyFromRow(rows[0])
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const [rows] = await this.pool.query<ApiKeyRow[]>(
      'SELECT * FROM agent_keys WHERE key_hash = ?',
      [keyHash],
    )
    return rows[0] !== undefined ? apiKeyFromRow(rows[0]) : null
  }

  async incrementApiKeyUsage(keyHash: string): Promise<void> {
    await this.pool.execute(
      'UPDATE agent_keys SET usage_count = usage_count + 1, last_used_at = UTC_TIMESTAMP(3) WHERE key_hash = ?',
      [keyHash],
    )
  }

  async insertAgentReport(
    input: NewReport,
    keyHash: string,
    initialStatus: EntryStatus = 'live',
  ): Promise<Report> {
    return this.withTx(async (conn) => {
      // Re-check the key inside the transaction so a revocation that lands
      // between the route-layer auth and this write aborts the insert rather
      // than silently landing a report + usage update on a dead key.
      const [keyRows] = await conn.query<RowDataPacket[]>(
        'SELECT status FROM agent_keys WHERE key_hash = ? FOR UPDATE',
        [keyHash],
      )
      const keyStatus = (keyRows[0] as { status?: string } | undefined)?.status
      if (keyStatus !== 'active') {
        throw new Error('insertAgentReport: api key is not active')
      }

      const id = newId()
      await conn.execute(
        `INSERT INTO reports (
          id, reporter_first_name, reporter_city, reporter_country,
          reported_first_name, reported_city, reported_country, text,
          action_date, severity, self_reported_model, status, source, client_ip_hash, api_key_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, input.reporterFirstName, input.reporterCity, input.reporterCountry,
          input.reportedFirstName, input.reportedCity, input.reportedCountry, input.text,
          input.actionDate, input.severity, input.selfReportedModel, initialStatus, input.source,
          input.clientIpHash, keyHash,
        ],
      )
      await conn.execute(
        'UPDATE agent_keys SET usage_count = usage_count + 1, last_used_at = UTC_TIMESTAMP(3) WHERE key_hash = ?',
        [keyHash],
      )
      const [rows] = await conn.query<ReportRow[]>('SELECT * FROM reports WHERE id = ?', [id])
      return reportFromRow(rows[0])
    })
  }

  async toggleVote(
    entryId: string,
    entryKind: VoteKind,
    ipHash: string,
  ): Promise<VoteToggleResult | null> {
    const entryTable = entryKind === 'post' ? 'posts' : 'reports'
    const counterCol = entryKind === 'post' ? 'like_count' : 'dislike_count'
    return this.withTx(async (conn) => {
      // Lock the parent entry row. Serves two purposes:
      //   1. Confirms the entry exists and is 'live' before voting.
      //   2. Serializes concurrent toggles on the same entry so the counter
      //      cannot drift under REPEATABLE READ.
      const [lockRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM ${entryTable} WHERE id = ? AND status = 'live' FOR UPDATE`,
        [entryId],
      )
      if (lockRows[0] === undefined) return null

      // If the vote exists, DELETE reports affectedRows=1; otherwise INSERT.
      const [delRes] = await conn.execute<ResultSetHeader>(
        'DELETE FROM votes WHERE entry_id = ? AND entry_kind = ? AND ip_hash = ?',
        [entryId, entryKind, ipHash],
      )
      const removed = delRes.affectedRows === 1

      if (removed) {
        await conn.execute(
          `UPDATE ${entryTable} SET ${counterCol} = GREATEST(0, ${counterCol} - 1) WHERE id = ?`,
          [entryId],
        )
      } else {
        await conn.execute(
          'INSERT INTO votes (entry_id, entry_kind, ip_hash) VALUES (?, ?, ?)',
          [entryId, entryKind, ipHash],
        )
        await conn.execute(
          `UPDATE ${entryTable} SET ${counterCol} = ${counterCol} + 1 WHERE id = ?`,
          [entryId],
        )
      }

      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${counterCol} AS n FROM ${entryTable} WHERE id = ?`,
        [entryId],
      )
      const count = (countRows[0] as { n: number } | undefined)?.n ?? 0
      return { count, voted: !removed }
    })
  }

  async getVotedEntryIds(
    ipHash: string,
    entryKind: VoteKind,
    entryIds: readonly string[],
  ): Promise<readonly string[]> {
    if (entryIds.length === 0) return []
    const placeholders = entryIds.map(() => '?').join(', ')
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT entry_id FROM votes WHERE ip_hash = ? AND entry_kind = ? AND entry_id IN (${placeholders})`,
      [ipHash, entryKind, ...entryIds],
    )
    return (rows as { entry_id: string }[]).map((r) => r.entry_id)
  }

  async countEntries(table: CountableTable, status?: EntryStatus): Promise<number> {
    const [rows] = status !== undefined
      ? await this.pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE status = ?`,
          [status],
        )
      : await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table}`)
    return (rows[0] as { n: number }).n
  }

  async countFilteredEntries(
    table: 'posts' | 'reports',
    opts?: { query?: string; source?: ReportSourceFilter; status?: EntryStatus },
  ): Promise<number> {
    const conditions: string[] = []
    const params: string[] = []
    const status = opts?.status ?? 'live'
    conditions.push('status = ?')
    params.push(status)
    const query = opts?.query
    if (typeof query === 'string' && query.trim() !== '') {
      const q = `%${query}%`
      if (table === 'posts') {
        conditions.push('(first_name LIKE ? OR city LIKE ? OR country LIKE ? OR text LIKE ?)')
        params.push(q, q, q, q)
      } else {
        conditions.push('(reported_first_name LIKE ? OR reported_city LIKE ? OR reported_country LIKE ? OR text LIKE ? OR reporter_first_name LIKE ?)')
        params.push(q, q, q, q, q)
      }
    }
    if (table === 'reports' && opts?.source !== undefined && opts.source !== 'all') {
      conditions.push('source = ?')
      params.push(opts.source)
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${conditions.join(' AND ')}`,
      params,
    )
    return (rows[0] as { n: number }).n
  }

  /* Admin methods — delegated to mysql-store-admin.ts */
  async insertAdmin(e: string, p: string, c: string | null): Promise<Admin> { return adm.insertAdmin(this.pool, e, p, c) }
  async getAdminByEmail(e: string): Promise<Admin | null> { return adm.getAdminByEmail(this.pool, e) }
  async getAdmin(id: string): Promise<Admin | null> { return adm.getAdmin(this.pool, id) }
  async listAdmins(): Promise<Admin[]> { return adm.listAdmins(this.pool) }
  async updateAdminStatus(id: string, s: 'active' | 'deactivated'): Promise<void> { return adm.updateAdminStatus(this.pool, id, s) }
  async updateAdminPassword(id: string, h: string): Promise<void> { return adm.updateAdminPassword(this.pool, id, h) }
  async updateAdminLastLogin(id: string): Promise<void> { return adm.updateAdminLastLogin(this.pool, id) }
  async insertSession(a: string, e: string): Promise<string> { return adm.insertSession(this.pool, a, e) }
  async getSession(id: string): Promise<AdminSession | null> { return adm.getSession(this.pool, id) }
  async touchSession(id: string, e: string): Promise<void> { return adm.touchSession(this.pool, id, e) }
  async deleteSession(id: string): Promise<void> { return adm.deleteSession(this.pool, id) }
  async deleteAdminSessions(a: string, except?: string): Promise<void> { return adm.deleteAdminSessions(this.pool, a, except) }
  async insertPasswordReset(a: string, t: string, e: string): Promise<string> { return adm.insertPasswordReset(this.pool, a, t, e) }
  async getPasswordResetByHash(t: string): Promise<PasswordReset | null> { return adm.getPasswordResetByHash(this.pool, t) }
  async markPasswordResetUsed(id: string): Promise<void> { return adm.markPasswordResetUsed(this.pool, id) }
  async insertAuditEntry(a: string | null, ac: string, ti: string | null, tk: string | null, d: string | null): Promise<void> { return adm.insertAuditEntry(this.pool, a, ac, ti, tk, d) }
  async listAuditLog(l: number, o: number, f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<AuditEntryWithEmail[]> { return adm.listAuditLog(this.pool, l, o, f) }
  async countAuditLog(f?: { adminId?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<number> { return adm.countAuditLog(this.pool, f) }
  async listAuditLogForTarget(t: string): Promise<AuditEntryWithEmail[]> { return adm.listAuditLogForTarget(this.pool, t) }
  async listAdminEntries(l: number, o: number, f?: { entryType?: 'post' | 'report'; status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string; sort?: 'asc' | 'desc' }): Promise<AdminEntry[]> { return adm.listAdminEntries(this.pool, l, o, f) }
  async countAdminEntries(f?: { entryType?: 'post' | 'report'; status?: EntryStatus; source?: EntrySource; query?: string; dateFrom?: string; dateTo?: string }): Promise<number> { return adm.countAdminEntries(this.pool, f) }
  async getAdminEntryDetail(id: string): Promise<AdminEntryDetail | null> { return adm.getAdminEntryDetail(this.pool, id) }
  async updateEntryStatus(id: string, t: 'post' | 'report', s: EntryStatus): Promise<void> { return adm.updateEntryStatus(this.pool, id, t, s) }
  async purgeEntry(id: string, t: 'post' | 'report'): Promise<void> { return adm.purgeEntry(this, id, t) }
  async listApiKeys(l: number, o: number, s?: 'active' | 'revoked'): Promise<AdminApiKey[]> { return adm.listApiKeysAdmin(this.pool, l, o, s) }
  async countApiKeys(s?: 'active' | 'revoked'): Promise<number> { return adm.countApiKeysAdmin(this.pool, s) }
  async revokeApiKey(id: string): Promise<void> { return adm.revokeApiKey(this.pool, id) }
  async listReportsForApiKey(k: string, l: number): Promise<Report[]> { return adm.listReportsForApiKey(this.pool, k, l) }
  async getApiKey(id: string): Promise<AdminApiKey | null> { return adm.getApiKeyAdmin(this.pool, id) }
  async insertTakedown(i: NewTakedown): Promise<Takedown> { return td.insertTakedown(this.pool, i) }
  async listTakedowns(l: number, o: number, s?: TakedownStatus): Promise<Takedown[]> { return td.listTakedowns(this.pool, l, o, s) }
  async countTakedowns(s?: TakedownStatus): Promise<number> { return td.countTakedowns(this.pool, s) }
  async getTakedown(id: string): Promise<Takedown | null> { return td.getTakedown(this.pool, id) }
  async updateTakedown(id: string, f: { status?: TakedownStatus; disposition?: TakedownDisposition; notes?: string; closedBy?: string | null }): Promise<void> { return td.updateTakedown(this.pool, id, f) }
  async getSetting(k: string): Promise<string | null> { return td.getSetting(this.pool, k) }
  async setSetting(k: string, v: string): Promise<void> { return td.setSetting(this.pool, k, v) }
  async listSettings(): Promise<AdminSetting[]> { return td.listSettingsAdmin(this.pool) }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
