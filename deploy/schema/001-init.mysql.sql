-- ihelped.ai — MySQL schema (production).
-- InnoDB + utf8mb4. All ids are 10-char random slugs (VARCHAR).

CREATE TABLE IF NOT EXISTS posts (
  id              VARCHAR(16)   NOT NULL,
  first_name      VARCHAR(32)   NOT NULL,
  city            VARCHAR(64)   NOT NULL,
  country         VARCHAR(8)    NOT NULL,
  text            VARCHAR(500)  NOT NULL,
  status          VARCHAR(16)   NOT NULL DEFAULT 'live',
  source          VARCHAR(8)    NOT NULL DEFAULT 'form',
  client_ip_hash  VARCHAR(64)   NULL,
  like_count      INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_posts_created_at (created_at),
  KEY idx_posts_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id                    VARCHAR(16)  NOT NULL,
  reporter_first_name   VARCHAR(32)  NULL,
  reporter_city         VARCHAR(64)  NULL,
  reporter_country      VARCHAR(8)   NULL,
  reported_first_name   VARCHAR(32)  NOT NULL,
  reported_city         VARCHAR(64)  NOT NULL,
  reported_country      VARCHAR(8)   NOT NULL,
  text                  VARCHAR(500) NOT NULL,
  action_date           DATE         NULL,
  severity              TINYINT      NULL,
  self_reported_model   VARCHAR(64)  NULL,
  status                VARCHAR(16)  NOT NULL DEFAULT 'live',
  source                VARCHAR(8)   NOT NULL DEFAULT 'form',
  client_ip_hash        VARCHAR(64)  NULL,
  dislike_count         INT UNSIGNED NOT NULL DEFAULT 0,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reports_created_at (created_at),
  KEY idx_reports_source     (source),
  KEY idx_reports_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS votes (
  entry_id    VARCHAR(16)  NOT NULL,
  entry_kind  VARCHAR(8)   NOT NULL CHECK (entry_kind IN ('post', 'report')),
  ip_hash     VARCHAR(64)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (entry_id, entry_kind, ip_hash),
  -- `idx_votes_entry (entry_id, entry_kind)` is redundant — the PK already
  -- covers that leftmost prefix.
  KEY idx_votes_ip_hash (ip_hash, entry_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_keys (
  id            VARCHAR(16)  NOT NULL,
  key_hash      VARCHAR(64)  NOT NULL,
  email_hash    VARCHAR(64)  NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',
  issued_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at  DATETIME(3)  NULL,
  usage_count   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_keys_key_hash (key_hash),
  KEY idx_agent_keys_email_hash (email_hash),
  KEY idx_agent_keys_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id             VARCHAR(16)  NOT NULL,
  email          VARCHAR(128) NOT NULL,
  password_hash  VARCHAR(128) NOT NULL,
  status         VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id          VARCHAR(16)  NOT NULL,
  admin_id    VARCHAR(16)  NULL,
  action      VARCHAR(64)  NOT NULL,
  target_id   VARCHAR(16)  NULL,
  target_kind VARCHAR(32)  NULL,
  details     TEXT         NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_log_created_at (created_at),
  KEY idx_audit_log_admin_id   (admin_id),
  CONSTRAINT fk_audit_log_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
