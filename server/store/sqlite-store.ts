import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import { customAlphabet } from 'nanoid'

import { buildContainsLikePattern } from '../lib/like-pattern.js'

import type {
  ApiKey,
  CountableTable,
  EntryStatus,
  NewApiKey,
  NewPost,
  NewReport,
  Post,
  Report,
  ReportSourceFilter,
  Store,
  VoteKind,
  VoteToggleResult,
} from './index.js'
import { SqliteStoreAdminFacade } from './sqlite-store-admin-facade.js'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const newId = customAlphabet(ID_ALPHABET, 10)

const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = resolve(THIS_DIR, '../../deploy/schema/001-init.sqlite.sql')

type PostRow = {
  id: string
  first_name: string
  city: string
  country: string
  text: string
  status: string
  source: string
  like_count: number
  created_at: string
}

type ReportRow = {
  id: string
  reporter_first_name: string | null
  reporter_city: string | null
  reporter_country: string | null
  reported_first_name: string
  reported_city: string
  reported_country: string
  text: string
  action_date: string | null
  severity: number | null
  self_reported_model: string | null
  status: string
  source: string
  dislike_count: number
  created_at: string
}

type ApiKeyRow = {
  id: string
  key_hash: string
  key_last4: string
  email_hash: string
  status: string
  issued_at: string
  last_used_at: string | null
  usage_count: number
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
  createdAt: r.created_at,
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
  actionDate: r.action_date,
  severity: r.severity,
  selfReportedModel: r.self_reported_model,
  status: r.status as Report['status'],
  source: r.source as Report['source'],
  dislikeCount: r.dislike_count,
  createdAt: r.created_at,
})

const apiKeyFromRow = (r: ApiKeyRow): ApiKey => ({
  id: r.id,
  keyHash: r.key_hash,
  keyLast4: r.key_last4,
  emailHash: r.email_hash,
  status: r.status as ApiKey['status'],
  issuedAt: r.issued_at,
  lastUsedAt: r.last_used_at,
  usageCount: r.usage_count,
})

/**
 * SQLite-backed Store for development and tests.
 * Uses better-sqlite3 which is synchronous; we wrap results in Promises
 * to conform to the async Store interface.
 */
export class SqliteStore extends SqliteStoreAdminFacade implements Store {
  constructor(path: string) {
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    super(db)
    const ddl = readFileSync(SCHEMA_PATH, 'utf8')
    this.migrate({ ignoreMissingTables: true })
    this.db.exec(ddl)
    this.migrate()
  }

  private migrate(opts: { ignoreMissingTables?: boolean } = {}): void {
    const addColumn = (table: string, def: string): void => {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (opts.ignoreMissingTables === true && msg.includes('no such table')) return
        if (!msg.includes('duplicate column name')) throw err
      }
    }
    addColumn('posts', 'like_count INTEGER NOT NULL DEFAULT 0')
    addColumn('reports', 'dislike_count INTEGER NOT NULL DEFAULT 0')
    addColumn('reports', 'api_key_hash TEXT')
    // Legacy agent_keys rows predate this column; the plaintext suffix cannot
    // be recovered from key_hash. Leave migrated rows empty so admin UX can
    // surface them as "legacy / rotation required" instead of a fake suffix.
    addColumn('agent_keys', "key_last4 TEXT NOT NULL DEFAULT ''")
    try {
      this.db
        .prepare(
          `
        UPDATE takedowns
        SET entry_kind = 'post'
        WHERE entry_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM posts WHERE posts.id = takedowns.entry_id)
          AND (entry_kind IS NULL OR entry_kind != 'post')
      `,
        )
        .run()
      this.db
        .prepare(
          `
        UPDATE takedowns
        SET entry_kind = 'report'
        WHERE entry_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM posts WHERE posts.id = takedowns.entry_id)
          AND EXISTS (SELECT 1 FROM reports WHERE reports.id = takedowns.entry_id)
          AND (entry_kind IS NULL OR entry_kind != 'report')
      `,
        )
        .run()
      this.db
        .prepare(
          `
        UPDATE takedowns
        SET entry_kind = NULL
        WHERE entry_kind IS NOT NULL AND entry_kind NOT IN ('post', 'report')
      `,
        )
        .run()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (!(opts.ignoreMissingTables === true && msg.includes('no such table'))) throw err
    }
    addColumn('agent_keys', 'last_used_at TEXT')
    addColumn('agent_keys', 'usage_count INTEGER NOT NULL DEFAULT 0')
    addColumn('admins', 'created_by TEXT')
    addColumn('admins', 'last_login_at TEXT')
  }

  async insertPost(input: NewPost): Promise<Post> {
    const id = newId()
    this.db
      .prepare(
        `INSERT INTO posts (id, first_name, city, country, text, status, source, client_ip_hash)
       VALUES (?, ?, ?, ?, ?, 'live', ?, ?)`,
      )
      .run(id, input.firstName, input.city, input.country, input.text, input.source, input.clientIpHash)
    return postFromRow(this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow)
  }

  async insertReport(input: NewReport): Promise<Report> {
    const id = newId()
    this.db
      .prepare(
        `INSERT INTO reports (
        id, reporter_first_name, reporter_city, reporter_country,
        reported_first_name, reported_city, reported_country, text,
        action_date, severity, self_reported_model, status, source, client_ip_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)`,
      )
      .run(
        id,
        input.reporterFirstName,
        input.reporterCity,
        input.reporterCountry,
        input.reportedFirstName,
        input.reportedCity,
        input.reportedCountry,
        input.text,
        input.actionDate,
        input.severity,
        input.selfReportedModel,
        input.source,
        input.clientIpHash,
      )
    return reportFromRow(this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow)
  }

  async getPost(id: string): Promise<Post | null> {
    const row = this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined
    return row !== undefined ? postFromRow(row) : null
  }

  async getReport(id: string): Promise<Report | null> {
    const row = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined
    return row !== undefined ? reportFromRow(row) : null
  }

  async getPostsByIds(ids: readonly string[]): Promise<Post[]> {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    // Enforce `status = 'live'` to match listPosts — the search index may lag
    // status transitions, so an id could still point at a pending/deleted row.
    const rows = this.db
      .prepare(`SELECT * FROM posts WHERE status = 'live' AND id IN (${placeholders})`)
      .all(...ids) as PostRow[]
    const byId = new Map<string, Post>()
    for (const row of rows) byId.set(row.id, postFromRow(row))
    return ids.map((id) => byId.get(id)).filter((p): p is Post => p !== undefined)
  }

  async getReportsByIds(ids: readonly string[]): Promise<Report[]> {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM reports WHERE status = 'live' AND id IN (${placeholders})`)
      .all(...ids) as ReportRow[]
    const byId = new Map<string, Report>()
    for (const row of rows) byId.set(row.id, reportFromRow(row))
    return ids.map((id) => byId.get(id)).filter((r): r is Report => r !== undefined)
  }

  async listPosts(limit: number, offset: number, query?: string): Promise<Post[]> {
    const hasQuery = typeof query === 'string' && query.trim() !== ''
    // `id DESC` as a deterministic tie-breaker — matches MysqlStore so dev and
    // prod paginate identically when multiple rows share a created_at ms.
    // `ESCAPE '\'` lets the LIKE operator treat %/_ in user input as literal
    // characters; SQLite has no default LIKE escape char without this clause.
    const sql = hasQuery
      ? `SELECT * FROM posts WHERE status = 'live' AND (first_name LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR country LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\') ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM posts WHERE status = 'live' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    const rows = hasQuery
      ? (this.db
          .prepare(sql)
          .all(
            buildContainsLikePattern(query),
            buildContainsLikePattern(query),
            buildContainsLikePattern(query),
            buildContainsLikePattern(query),
            limit,
            offset,
          ) as PostRow[])
      : (this.db.prepare(sql).all(limit, offset) as PostRow[])
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
      conditions.push(
        `(reported_first_name LIKE ? ESCAPE '\\' OR reported_city LIKE ? ESCAPE '\\' OR reported_country LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR reporter_first_name LIKE ? ESCAPE '\\')`,
      )
      const q = buildContainsLikePattern(query)
      params.push(q, q, q, q, q)
    }
    params.push(limit, offset)
    // `id DESC` as a deterministic tie-breaker — matches MysqlStore.
    return (
      this.db
        .prepare(
          `SELECT * FROM reports WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params) as ReportRow[]
    ).map(reportFromRow)
  }

  async listAgentReports(limit: number, offset: number): Promise<Report[]> {
    return this.listReports(limit, offset, undefined, 'api')
  }

  async insertApiKey(input: NewApiKey): Promise<ApiKey> {
    const id = newId()
    this.db
      .prepare('INSERT INTO agent_keys (id, key_hash, key_last4, email_hash, status) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.keyHash, input.keyLast4, input.emailHash, input.status)
    return apiKeyFromRow(this.db.prepare('SELECT * FROM agent_keys WHERE id = ?').get(id) as ApiKeyRow)
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const row = this.db.prepare('SELECT * FROM agent_keys WHERE key_hash = ?').get(keyHash) as ApiKeyRow | undefined
    return row !== undefined ? apiKeyFromRow(row) : null
  }

  async incrementApiKeyUsage(keyHash: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE agent_keys SET usage_count = usage_count + 1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key_hash = ?`,
      )
      .run(keyHash)
  }

  async insertAgentReport(input: NewReport, keyHash: string, initialStatus: EntryStatus = 'live'): Promise<Report> {
    const txn = this.db.transaction((): Report => {
      // Re-check key status inside the transaction so a revoke racing
      // between the route-layer auth and this write aborts the insert rather
      // than silently landing a report + usage update on a dead key. Mirrors
      // the SELECT ... FOR UPDATE gate in MysqlStore.insertAgentReport.
      const keyRow = this.db.prepare('SELECT status FROM agent_keys WHERE key_hash = ?').get(keyHash) as
        | { status: string }
        | undefined
      if (keyRow?.status !== 'active') {
        throw new Error('insertAgentReport: api key is not active')
      }
      const id = newId()
      this.db
        .prepare(
          `INSERT INTO reports (id, reporter_first_name, reporter_city, reporter_country, reported_first_name, reported_city, reported_country, text, action_date, severity, self_reported_model, status, source, client_ip_hash, api_key_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.reporterFirstName,
          input.reporterCity,
          input.reporterCountry,
          input.reportedFirstName,
          input.reportedCity,
          input.reportedCountry,
          input.text,
          input.actionDate,
          input.severity,
          input.selfReportedModel,
          initialStatus,
          input.source,
          input.clientIpHash,
          keyHash,
        )
      this.db
        .prepare(
          `UPDATE agent_keys SET usage_count = usage_count + 1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key_hash = ?`,
        )
        .run(keyHash)
      return reportFromRow(this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow)
    })
    return txn()
  }

  async toggleVote(entryId: string, entryKind: VoteKind, ipHash: string): Promise<VoteToggleResult | null> {
    const entryTable = entryKind === 'post' ? 'posts' : 'reports'
    const counterCol = entryKind === 'post' ? 'like_count' : 'dislike_count'
    const exists = this.db
      .prepare(`SELECT 1 AS ok FROM ${entryTable} WHERE id = ? AND status = 'live'`)
      .get(entryId) as { ok: number } | undefined
    if (exists === undefined) return null
    const txn = this.db.transaction((): VoteToggleResult => {
      const existing = this.db
        .prepare('SELECT 1 AS ok FROM votes WHERE entry_id = ? AND entry_kind = ? AND ip_hash = ?')
        .get(entryId, entryKind, ipHash) as { ok: number } | undefined
      if (existing !== undefined) {
        this.db
          .prepare('DELETE FROM votes WHERE entry_id = ? AND entry_kind = ? AND ip_hash = ?')
          .run(entryId, entryKind, ipHash)
        this.db.prepare(`UPDATE ${entryTable} SET ${counterCol} = MAX(0, ${counterCol} - 1) WHERE id = ?`).run(entryId)
        return { count: this.readCounter(entryTable, counterCol, entryId), voted: false }
      }
      this.db
        .prepare('INSERT INTO votes (entry_id, entry_kind, ip_hash) VALUES (?, ?, ?)')
        .run(entryId, entryKind, ipHash)
      this.db.prepare(`UPDATE ${entryTable} SET ${counterCol} = ${counterCol} + 1 WHERE id = ?`).run(entryId)
      return { count: this.readCounter(entryTable, counterCol, entryId), voted: true }
    })
    return txn()
  }

  private readCounter(table: string, col: string, id: string): number {
    return (
      (this.db.prepare(`SELECT ${col} AS n FROM ${table} WHERE id = ?`).get(id) as { n: number } | undefined)?.n ?? 0
    )
  }

  async getVotedEntryIds(ipHash: string, entryKind: VoteKind, entryIds: readonly string[]): Promise<readonly string[]> {
    if (entryIds.length === 0) return []
    const placeholders = entryIds.map(() => '?').join(', ')
    return (
      this.db
        .prepare(`SELECT entry_id FROM votes WHERE ip_hash = ? AND entry_kind = ? AND entry_id IN (${placeholders})`)
        .all(ipHash, entryKind, ...entryIds) as { entry_id: string }[]
    ).map((r) => r.entry_id)
  }

  async countEntries(table: CountableTable, status?: EntryStatus): Promise<number> {
    const sql =
      status !== undefined
        ? `SELECT COUNT(*) AS n FROM ${table} WHERE status = ?`
        : `SELECT COUNT(*) AS n FROM ${table}`
    const row = (status !== undefined ? this.db.prepare(sql).get(status) : this.db.prepare(sql).get()) as { n: number }
    return row.n
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
      const q = buildContainsLikePattern(query)
      if (table === 'posts') {
        conditions.push(
          `(first_name LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR country LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')`,
        )
        params.push(q, q, q, q)
      } else {
        conditions.push(
          `(reported_first_name LIKE ? ESCAPE '\\' OR reported_city LIKE ? ESCAPE '\\' OR reported_country LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR reporter_first_name LIKE ? ESCAPE '\\')`,
        )
        params.push(q, q, q, q, q)
      }
    }
    if (table === 'reports' && opts?.source !== undefined && opts.source !== 'all') {
      conditions.push('source = ?')
      params.push(opts.source)
    }
    const sql = `SELECT COUNT(*) AS n FROM ${table} WHERE ${conditions.join(' AND ')}`
    return (this.db.prepare(sql).get(...params) as { n: number }).n
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
