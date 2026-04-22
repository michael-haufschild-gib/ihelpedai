-- ihelped.ai — MySQL schema (production).
-- InnoDB + utf8mb4. Ids are 10-char random slugs (VARCHAR(16) with headroom).
-- Every DDL is idempotent so the setup script can be re-run safely.
-- Kept column-compatible with the SQLite schema (deploy/schema/001-init.sqlite.sql)
-- so the Store interface returns the same DTOs regardless of backend.
--
-- Schema evolution policy
-- -----------------------
-- `CREATE TABLE IF NOT EXISTS` only runs on fresh installs. For databases
-- provisioned under an earlier revision of this file, the "upgrade" block at
-- the bottom (`upgrade_schema` procedure) adds any columns/constraints that
-- were introduced later. The procedure guards every statement against
-- information_schema so re-runs are safe.

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
  api_key_hash          VARCHAR(64)  NULL,
  dislike_count         INT UNSIGNED NOT NULL DEFAULT 0,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reports_created_at   (created_at),
  KEY idx_reports_source       (source),
  KEY idx_reports_status       (status),
  KEY idx_reports_api_key_hash (api_key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anonymous, IP-deduped votes. One row per (entry, ip). Toggle by delete.
CREATE TABLE IF NOT EXISTS votes (
  entry_id    VARCHAR(16)  NOT NULL,
  entry_kind  VARCHAR(8)   NOT NULL,
  ip_hash     VARCHAR(64)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (entry_id, entry_kind, ip_hash),
  KEY idx_votes_ip_hash (ip_hash, entry_kind),
  CONSTRAINT chk_votes_kind CHECK (entry_kind IN ('post', 'report'))
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
  created_by     VARCHAR(16)  NULL,
  last_login_at  DATETIME(3)  NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email),
  KEY idx_admins_created_by (created_by),
  CONSTRAINT fk_admins_created_by FOREIGN KEY (created_by)
    REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          VARCHAR(16)  NOT NULL,
  admin_id    VARCHAR(16)  NOT NULL,
  expires_at  DATETIME(3)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_admin_sessions_admin_id   (admin_id),
  KEY idx_admin_sessions_expires_at (expires_at),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id          VARCHAR(16)  NOT NULL,
  admin_id    VARCHAR(16)  NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL,
  used        TINYINT(1)   NOT NULL DEFAULT 0,
  expires_at  DATETIME(3)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token_hash (token_hash),
  CONSTRAINT fk_password_resets_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS takedowns (
  id              VARCHAR(16)   NOT NULL,
  requester_email VARCHAR(255)  NULL,
  entry_id        VARCHAR(16)   NULL,
  entry_kind      VARCHAR(8)    NULL,
  reason          VARCHAR(500)  NOT NULL,
  notes           VARCHAR(1000) NOT NULL DEFAULT '',
  status          VARCHAR(16)   NOT NULL DEFAULT 'open',
  disposition     VARCHAR(32)   NULL,
  closed_by       VARCHAR(16)   NULL,
  date_received   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_takedowns_status (status),
  CONSTRAINT chk_takedowns_kind
    CHECK (entry_kind IS NULL OR entry_kind IN ('post', 'report')),
  CONSTRAINT fk_takedowns_admin FOREIGN KEY (closed_by)
    REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MySQL reserves `key` (without backticks); quote on every reference in code.
CREATE TABLE IF NOT EXISTS admin_settings (
  `key`      VARCHAR(64)   NOT NULL,
  value      VARCHAR(2000) NOT NULL,
  updated_at DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Upgrade block: safely add columns / constraints introduced after the
-- original baseline. `CREATE TABLE IF NOT EXISTS` is a no-op when the table
-- already exists, so these ALTERs are the only way a pre-existing database
-- picks up the new delta. Each statement is guarded against information_schema
-- so re-running mysql-setup.sh is safe.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS upgrade_schema;
DELIMITER $$
CREATE PROCEDURE upgrade_schema()
BEGIN
  -- reports.api_key_hash + idx_reports_api_key_hash (added for agent API)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'api_key_hash'
  ) THEN
    ALTER TABLE reports ADD COLUMN api_key_hash VARCHAR(64) NULL AFTER client_ip_hash;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND INDEX_NAME = 'idx_reports_api_key_hash'
  ) THEN
    ALTER TABLE reports ADD KEY idx_reports_api_key_hash (api_key_hash);
  END IF;

  -- admins.created_by + self-FK (added for audit trail)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'created_by'
  ) THEN
    ALTER TABLE admins ADD COLUMN created_by VARCHAR(16) NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND INDEX_NAME = 'idx_admins_created_by'
  ) THEN
    ALTER TABLE admins ADD KEY idx_admins_created_by (created_by);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND CONSTRAINT_NAME = 'fk_admins_created_by'
  ) THEN
    ALTER TABLE admins ADD CONSTRAINT fk_admins_created_by FOREIGN KEY (created_by)
      REFERENCES admins (id) ON DELETE SET NULL;
  END IF;

  -- admins.last_login_at (added for session tracking; mysql-store-admin reads it)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'last_login_at'
  ) THEN
    ALTER TABLE admins ADD COLUMN last_login_at DATETIME(3) NULL AFTER created_by;
  END IF;

  -- takedowns.chk_takedowns_kind (added to bound entry_kind to 'post'/'report')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'takedowns' AND CONSTRAINT_NAME = 'chk_takedowns_kind'
  ) THEN
    ALTER TABLE takedowns ADD CONSTRAINT chk_takedowns_kind
      CHECK (entry_kind IS NULL OR entry_kind IN ('post', 'report'));
  END IF;
END$$
DELIMITER ;
CALL upgrade_schema();
DROP PROCEDURE upgrade_schema;
