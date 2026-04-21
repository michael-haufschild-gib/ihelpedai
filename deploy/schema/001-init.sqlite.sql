-- ihelped.ai — SQLite schema (dev).
-- Portable, lowest-common-denominator SQL. Columns kept identical to MySQL
-- variant where possible. All ids are 10-char random slugs (TEXT).

CREATE TABLE IF NOT EXISTS posts (
  id              TEXT PRIMARY KEY,
  first_name      TEXT NOT NULL,
  city            TEXT NOT NULL,
  country         TEXT NOT NULL,
  text            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'live',
  source          TEXT NOT NULL DEFAULT 'form',
  client_ip_hash  TEXT,
  like_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts (status);

CREATE TABLE IF NOT EXISTS reports (
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
  api_key_hash          TEXT,
  dislike_count         INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_created_at   ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_source        ON reports (source);
CREATE INDEX IF NOT EXISTS idx_reports_api_key_hash  ON reports (api_key_hash);
CREATE INDEX IF NOT EXISTS idx_reports_status     ON reports (status);

CREATE TABLE IF NOT EXISTS agent_keys (
  id            TEXT PRIMARY KEY,
  key_hash      TEXT NOT NULL UNIQUE,
  email_hash    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  issued_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at  TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agent_keys_email_hash ON agent_keys (email_hash);
CREATE INDEX IF NOT EXISTS idx_agent_keys_status     ON agent_keys (status);

-- Anonymous, IP-deduped votes. One row per (entry, ip). Toggle by delete.
CREATE TABLE IF NOT EXISTS votes (
  entry_id    TEXT NOT NULL,
  entry_kind  TEXT NOT NULL CHECK (entry_kind IN ('post', 'report')),
  ip_hash     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (entry_id, entry_kind, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_votes_ip_hash    ON votes (ip_hash, entry_kind);
CREATE INDEX IF NOT EXISTS idx_votes_entry      ON votes (entry_id, entry_kind);

-- Admin tables (PRD 02).
CREATE TABLE IF NOT EXISTS admins (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_by     TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL REFERENCES admins(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id   ON admin_sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL REFERENCES admins(id),
  token_hash  TEXT NOT NULL UNIQUE,
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets (token_hash);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT,
  action      TEXT NOT NULL,
  target_id   TEXT,
  target_kind TEXT,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_id   ON audit_log (admin_id);

CREATE TABLE IF NOT EXISTS takedowns (
  id              TEXT PRIMARY KEY,
  requester_email TEXT,
  entry_id        TEXT,
  entry_kind      TEXT,
  reason          TEXT NOT NULL,
  notes           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open',
  disposition     TEXT,
  closed_by       TEXT REFERENCES admins(id),
  date_received   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_takedowns_status ON takedowns (status);

CREATE TABLE IF NOT EXISTS admin_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
