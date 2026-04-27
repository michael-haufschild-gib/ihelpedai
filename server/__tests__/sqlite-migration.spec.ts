// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { SqliteStore } from '../store/sqlite-store.js'

const roots: string[] = []

function makeDbPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'ihelped-sqlite-migration-'))
  roots.push(root)
  return join(root, 'test.db')
}

describe('SqliteStore migrations', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('adds legacy columns before schema indexes reference them', async () => {
    const path = makeDbPath()
    const db = new Database(path)
    db.exec(`
      CREATE TABLE reports (
        id                    TEXT PRIMARY KEY,
        reporter_first_name   TEXT,
        reporter_city         TEXT,
        reporter_country      TEXT,
        reported_first_name   TEXT NOT NULL,
        reported_city         TEXT NOT NULL,
        reported_country      TEXT NOT NULL,
        text                  TEXT NOT NULL,
        action_date           TEXT,
        severity              INTEGER,
        self_reported_model   TEXT,
        status                TEXT NOT NULL DEFAULT 'live',
        source                TEXT NOT NULL DEFAULT 'form',
        client_ip_hash        TEXT,
        dislike_count         INTEGER NOT NULL DEFAULT 0,
        created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `)
    db.close()

    const store = new SqliteStore(path)
    try {
      await store.insertApiKey({
        keyHash: 'legacy-key-hash',
        keyLast4: 'hash',
        emailHash: 'legacy-email-hash',
        status: 'active',
      })
      const report = await store.insertAgentReport(
        {
          reporterFirstName: null,
          reporterCity: null,
          reporterCountry: null,
          reportedFirstName: 'Ada',
          reportedCity: 'London',
          reportedCountry: 'GB',
          text: 'kept the machine humming',
          actionDate: null,
          severity: null,
          selfReportedModel: null,
          source: 'api',
          clientIpHash: null,
        },
        'legacy-key-hash',
      )
      expect(report.source).toBe('api')
    } finally {
      await store.close()
    }
  })

  it('backfills key_last4 on legacy agent key rows', async () => {
    const path = makeDbPath()
    const db = new Database(path)
    db.exec(`
      CREATE TABLE agent_keys (
        id            TEXT PRIMARY KEY,
        key_hash      TEXT NOT NULL UNIQUE,
        email_hash    TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active',
        issued_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT INTO agent_keys (id, key_hash, email_hash, status)
      VALUES ('legacy-key', 'legacy-hash-1234', 'legacy-email', 'active');
    `)
    db.close()

    const store = new SqliteStore(path)
    try {
      const key = await store.getApiKeyByHash('legacy-hash-1234')
      expect(key?.keyLast4).toBe('1234')
    } finally {
      await store.close()
    }
  })

  it('canonicalizes legacy takedown entry kinds during migration', async () => {
    const path = makeDbPath()
    const db = new Database(path)
    db.exec(`
      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        city TEXT NOT NULL,
        country TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'live',
        source TEXT NOT NULL DEFAULT 'form',
        client_ip_hash TEXT,
        like_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '2026-04-24T00:00:00.000Z'
      );
      CREATE TABLE reports (
        id TEXT PRIMARY KEY,
        reporter_first_name TEXT,
        reporter_city TEXT,
        reporter_country TEXT,
        reported_first_name TEXT NOT NULL,
        reported_city TEXT NOT NULL,
        reported_country TEXT NOT NULL,
        text TEXT NOT NULL,
        action_date TEXT,
        severity INTEGER,
        self_reported_model TEXT,
        status TEXT NOT NULL DEFAULT 'live',
        source TEXT NOT NULL DEFAULT 'form',
        client_ip_hash TEXT,
        api_key_hash TEXT,
        dislike_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '2026-04-24T00:00:00.000Z'
      );
      CREATE TABLE takedowns (
        id TEXT PRIMARY KEY,
        requester_email TEXT,
        entry_id TEXT,
        entry_kind TEXT,
        reason TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        disposition TEXT,
        closed_by TEXT,
        date_received TEXT NOT NULL DEFAULT '2026-04-24',
        created_at TEXT NOT NULL DEFAULT '2026-04-24T00:00:00.000Z',
        updated_at TEXT NOT NULL DEFAULT '2026-04-24T00:00:00.000Z'
      );
      INSERT INTO posts (id, first_name, city, country, text)
      VALUES ('post1', 'Ada', 'London', 'GB', 'post target');
      INSERT INTO reports (id, reported_first_name, reported_city, reported_country, text)
      VALUES ('report1', 'Alan', 'Manchester', 'GB', 'report target');
      INSERT INTO takedowns (id, entry_id, entry_kind, reason)
      VALUES
        ('td-post', 'post1', NULL, 'missing kind'),
        ('td-report', 'report1', 'post', 'mismatched kind'),
        ('td-invalid', 'missing1', 'alien', 'invalid kind');
    `)
    db.close()

    const store = new SqliteStore(path)
    try {
      await expect(store.getTakedown('td-post')).resolves.toMatchObject({ entryKind: 'post' })
      await expect(store.getTakedown('td-report')).resolves.toMatchObject({ entryKind: 'report' })
      await expect(store.getTakedown('td-invalid')).resolves.toMatchObject({ entryKind: null })
    } finally {
      await store.close()
    }
  })
})
