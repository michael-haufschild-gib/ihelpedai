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
  KEY idx_posts_status     (status),
  CONSTRAINT chk_posts_status CHECK (status IN ('live', 'pending', 'deleted')),
  CONSTRAINT chk_posts_source CHECK (source IN ('form', 'api'))
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
  KEY idx_reports_api_key_hash (api_key_hash),
  CONSTRAINT chk_reports_status CHECK (status IN ('live', 'pending', 'deleted')),
  CONSTRAINT chk_reports_source CHECK (source IN ('form', 'api')),
  CONSTRAINT chk_reports_severity CHECK (severity IS NULL OR severity BETWEEN 1 AND 10)
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
  key_last4     VARCHAR(8)   NOT NULL,
  email_hash    VARCHAR(64)  NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'active',
  issued_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at  DATETIME(3)  NULL,
  usage_count   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_keys_key_hash (key_hash),
  KEY idx_agent_keys_email_hash (email_hash),
  KEY idx_agent_keys_status     (status),
  CONSTRAINT chk_agent_keys_status CHECK (status IN ('active', 'revoked'))
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
  CONSTRAINT chk_admins_status CHECK (status IN ('active', 'deactivated')),
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
  KEY idx_password_resets_expires_at (expires_at),
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
  KEY idx_audit_log_target     (target_id, created_at),
  CONSTRAINT fk_audit_log_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS takedowns (
  id              VARCHAR(16)   NOT NULL,
  requester_email VARCHAR(255)  NULL,
  entry_id        VARCHAR(16)   NULL,
  entry_kind      VARCHAR(8)    NULL,
  reason          VARCHAR(2000) NOT NULL,
  notes           VARCHAR(5000) NOT NULL DEFAULT '',
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
  CONSTRAINT chk_takedowns_status CHECK (status IN ('open', 'closed')),
  CONSTRAINT chk_takedowns_disposition
    CHECK (disposition IS NULL OR disposition IN ('entry_deleted', 'entry_kept', 'entry_edited', 'other')),
  CONSTRAINT fk_takedowns_admin FOREIGN KEY (closed_by)
    REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MySQL reserves `key` (without backticks); quote on every reference in code.
CREATE TABLE IF NOT EXISTS admin_settings (
  `key`      VARCHAR(64)   NOT NULL,
  value      VARCHAR(10000) NOT NULL,
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

  -- agent_keys.key_last4 (plaintext suffix for admin identification)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_keys' AND COLUMN_NAME = 'key_last4'
  ) THEN
    ALTER TABLE agent_keys ADD COLUMN key_last4 VARCHAR(8) NOT NULL DEFAULT '' AFTER key_hash;
    UPDATE agent_keys SET key_last4 = RIGHT(key_hash, 4) WHERE key_last4 = '';
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
  UPDATE takedowns t
  JOIN posts p ON p.id = t.entry_id
  SET t.entry_kind = 'post'
  WHERE t.entry_id IS NOT NULL
    AND (t.entry_kind IS NULL OR t.entry_kind != 'post');
  UPDATE takedowns t
  JOIN reports r ON r.id = t.entry_id
  LEFT JOIN posts p ON p.id = t.entry_id
  SET t.entry_kind = 'report'
  WHERE p.id IS NULL
    AND t.entry_id IS NOT NULL
    AND (t.entry_kind IS NULL OR t.entry_kind != 'report');
  UPDATE takedowns
  SET entry_kind = NULL
  WHERE entry_kind IS NOT NULL AND entry_kind NOT IN ('post', 'report');
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'takedowns' AND CONSTRAINT_NAME = 'chk_takedowns_kind'
  ) THEN
    ALTER TABLE takedowns ADD CONSTRAINT chk_takedowns_kind
      CHECK (entry_kind IS NULL OR entry_kind IN ('post', 'report'));
  END IF;

  -- enum-domain CHECK constraints (match Store + wire-schema union types)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND CONSTRAINT_NAME = 'chk_posts_status'
  ) THEN
    ALTER TABLE posts ADD CONSTRAINT chk_posts_status
      CHECK (status IN ('live', 'pending', 'deleted'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND CONSTRAINT_NAME = 'chk_posts_source'
  ) THEN
    ALTER TABLE posts ADD CONSTRAINT chk_posts_source
      CHECK (source IN ('form', 'api'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND CONSTRAINT_NAME = 'chk_reports_status'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT chk_reports_status
      CHECK (status IN ('live', 'pending', 'deleted'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND CONSTRAINT_NAME = 'chk_reports_source'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT chk_reports_source
      CHECK (source IN ('form', 'api'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND CONSTRAINT_NAME = 'chk_reports_severity'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT chk_reports_severity
      CHECK (severity IS NULL OR severity BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_keys' AND CONSTRAINT_NAME = 'chk_agent_keys_status'
  ) THEN
    ALTER TABLE agent_keys ADD CONSTRAINT chk_agent_keys_status
      CHECK (status IN ('active', 'revoked'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND CONSTRAINT_NAME = 'chk_admins_status'
  ) THEN
    ALTER TABLE admins ADD CONSTRAINT chk_admins_status
      CHECK (status IN ('active', 'deactivated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'takedowns' AND CONSTRAINT_NAME = 'chk_takedowns_status'
  ) THEN
    ALTER TABLE takedowns ADD CONSTRAINT chk_takedowns_status
      CHECK (status IN ('open', 'closed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'takedowns' AND CONSTRAINT_NAME = 'chk_takedowns_disposition'
  ) THEN
    ALTER TABLE takedowns ADD CONSTRAINT chk_takedowns_disposition
      CHECK (disposition IS NULL OR disposition IN ('entry_deleted', 'entry_kept', 'entry_edited', 'other'));
  END IF;

  -- audit_log target lookup index (used by admin entry detail pages)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log' AND INDEX_NAME = 'idx_audit_log_target'
  ) THEN
    ALTER TABLE audit_log ADD KEY idx_audit_log_target (target_id, created_at);
  END IF;

  -- Password reset cleanup scans by expiry.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_resets' AND INDEX_NAME = 'idx_password_resets_expires_at'
  ) THEN
    ALTER TABLE password_resets ADD KEY idx_password_resets_expires_at (expires_at);
  END IF;

  -- Keep MySQL column sizes aligned with route validators.
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'takedowns'
      AND COLUMN_NAME = 'reason' AND CHARACTER_MAXIMUM_LENGTH < 2000
  ) THEN
    ALTER TABLE takedowns MODIFY COLUMN reason VARCHAR(2000) NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'takedowns'
      AND COLUMN_NAME = 'notes' AND CHARACTER_MAXIMUM_LENGTH < 5000
  ) THEN
    ALTER TABLE takedowns MODIFY COLUMN notes VARCHAR(5000) NOT NULL DEFAULT '';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_settings'
      AND COLUMN_NAME = 'value' AND CHARACTER_MAXIMUM_LENGTH < 10000
  ) THEN
    ALTER TABLE admin_settings MODIFY COLUMN value VARCHAR(10000) NOT NULL;
  END IF;
END$$
DELIMITER ;
CALL upgrade_schema();
DROP PROCEDURE upgrade_schema;
