import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import type { Database as SqliteDatabase } from 'better-sqlite3'
import { customAlphabet } from 'nanoid'

import type {
  ApiKey,
  CountableTable,
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

const ID_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
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
export class SqliteStore implements Store {
  private readonly db: SqliteDatabase

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    const ddl = readFileSync(SCHEMA_PATH, 'utf8')
    this.db.exec(ddl)
    this.migrate()
  }

  /**
   * Idempotent in-place migrations for dev DBs created before the current
   * schema. `CREATE TABLE IF NOT EXISTS` skips ALTERs, so new columns are
   * added here with try/catch on the duplicate-column error. Fresh DBs hit
   * the error path on every boot and the constructor does not report it.
   */
  private migrate(): void {
    const addColumn = (table: string, def: string): void => {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (!msg.includes('duplicate column name')) throw err
      }
    }
    addColumn('posts', 'like_count INTEGER NOT NULL DEFAULT 0')
    addColumn('reports', 'dislike_count INTEGER NOT NULL DEFAULT 0')
  }

  async insertPost(input: NewPost): Promise<Post> {
    const id = newId()
    const stmt = this.db.prepare(
      `INSERT INTO posts (id, first_name, city, country, text, status, source, client_ip_hash)
       VALUES (?, ?, ?, ?, ?, 'live', ?, ?)`,
    )
    stmt.run(id, input.firstName, input.city, input.country, input.text, input.source, input.clientIpHash)
    const row = this.db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as PostRow
    return postFromRow(row)
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
    const row = this.db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id) as ReportRow
    return reportFromRow(row)
  }

  async getPost(id: string): Promise<Post | null> {
    const row = this.db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as PostRow | undefined
    return row !== undefined ? postFromRow(row) : null
  }

  async getReport(id: string): Promise<Report | null> {
    const row = this.db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id) as
      | ReportRow
      | undefined
    return row !== undefined ? reportFromRow(row) : null
  }

  async listPosts(limit: number, offset: number, query?: string): Promise<Post[]> {
    const hasQuery = typeof query === 'string' && query.trim() !== ''
    const sql = hasQuery
      ? `SELECT * FROM posts
         WHERE status = 'live'
           AND (first_name LIKE ? OR city LIKE ? OR country LIKE ? OR text LIKE ?)
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM posts WHERE status = 'live'
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
    const rows = hasQuery
      ? (this.db
          .prepare(sql)
          .all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit, offset) as PostRow[])
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
      conditions.push(`source = ?`)
      params.push(sourceFilter)
    }
    if (typeof query === 'string' && query.trim() !== '') {
      conditions.push(
        `(reported_first_name LIKE ? OR reported_city LIKE ? OR reported_country LIKE ? OR text LIKE ? OR reporter_first_name LIKE ?)`,
      )
      const q = `%${query}%`
      params.push(q, q, q, q, q)
    }
    const sql = `SELECT * FROM reports WHERE ${conditions.join(' AND ')}
                 ORDER BY created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)
    const rows = this.db.prepare(sql).all(...params) as ReportRow[]
    return rows.map(reportFromRow)
  }

  async listAgentReports(limit: number, offset: number): Promise<Report[]> {
    return this.listReports(limit, offset, undefined, 'api')
  }

  async insertApiKey(input: NewApiKey): Promise<ApiKey> {
    const id = newId()
    this.db
      .prepare(
        `INSERT INTO agent_keys (id, key_hash, email_hash, status) VALUES (?, ?, ?, ?)`,
      )
      .run(id, input.keyHash, input.emailHash, input.status)
    const row = this.db.prepare(`SELECT * FROM agent_keys WHERE id = ?`).get(id) as ApiKeyRow
    return apiKeyFromRow(row)
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const row = this.db
      .prepare(`SELECT * FROM agent_keys WHERE key_hash = ?`)
      .get(keyHash) as ApiKeyRow | undefined
    return row !== undefined ? apiKeyFromRow(row) : null
  }

  async incrementApiKeyUsage(keyHash: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE agent_keys
         SET usage_count = usage_count + 1,
             last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE key_hash = ?`,
      )
      .run(keyHash)
  }

  async toggleVote(
    entryId: string,
    entryKind: VoteKind,
    ipHash: string,
  ): Promise<VoteToggleResult | null> {
    const entryTable = entryKind === 'post' ? 'posts' : 'reports'
    const counterCol = entryKind === 'post' ? 'like_count' : 'dislike_count'
    const exists = this.db
      .prepare(
        `SELECT 1 AS ok FROM ${entryTable} WHERE id = ? AND status = 'live'`,
      )
      .get(entryId) as { ok: number } | undefined
    if (exists === undefined) return null
    const txn = this.db.transaction((): VoteToggleResult => {
      const existing = this.db
        .prepare(
          `SELECT 1 AS ok FROM votes WHERE entry_id = ? AND entry_kind = ? AND ip_hash = ?`,
        )
        .get(entryId, entryKind, ipHash) as { ok: number } | undefined
      if (existing !== undefined) {
        this.db
          .prepare(
            `DELETE FROM votes WHERE entry_id = ? AND entry_kind = ? AND ip_hash = ?`,
          )
          .run(entryId, entryKind, ipHash)
        this.db
          .prepare(
            `UPDATE ${entryTable} SET ${counterCol} = MAX(0, ${counterCol} - 1) WHERE id = ?`,
          )
          .run(entryId)
        return { count: this.readCounter(entryTable, counterCol, entryId), voted: false }
      }
      this.db
        .prepare(
          `INSERT INTO votes (entry_id, entry_kind, ip_hash) VALUES (?, ?, ?)`,
        )
        .run(entryId, entryKind, ipHash)
      this.db
        .prepare(`UPDATE ${entryTable} SET ${counterCol} = ${counterCol} + 1 WHERE id = ?`)
        .run(entryId)
      return { count: this.readCounter(entryTable, counterCol, entryId), voted: true }
    })
    return txn()
  }

  private readCounter(table: string, col: string, id: string): number {
    const row = this.db
      .prepare(`SELECT ${col} AS n FROM ${table} WHERE id = ?`)
      .get(id) as { n: number } | undefined
    return row?.n ?? 0
  }

  async getVotedEntryIds(
    ipHash: string,
    entryKind: VoteKind,
    entryIds: readonly string[],
  ): Promise<readonly string[]> {
    if (entryIds.length === 0) return []
    const placeholders = entryIds.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT entry_id FROM votes
           WHERE ip_hash = ? AND entry_kind = ? AND entry_id IN (${placeholders})`,
      )
      .all(ipHash, entryKind, ...entryIds) as { entry_id: string }[]
    return rows.map((r) => r.entry_id)
  }

  async countEntries(table: CountableTable): Promise<number> {
    // Whitelisted literal table names only; never interpolate user input.
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
    return row.n
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
