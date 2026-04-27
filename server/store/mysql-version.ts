import type { Pool, RowDataPacket } from 'mysql2/promise'

/**
 * Minimum MySQL version that enforces CHECK constraints. Earlier versions
 * (and MySQL 8.0.0–8.0.15) silently parse-and-ignore `CHECK (...)`, which
 * means the schema in `deploy/schema/001-init.mysql.sql` would advertise
 * domain bounds the database does not actually enforce — a footgun where
 * application validation drifts from storage validation undetected.
 */
const MIN_MAJOR = 8
const MIN_MINOR = 0
const MIN_PATCH = 16

/**
 * Result of {@link parseMysqlVersion}. `vendor === 'mariadb'` is rejected
 * outright because MariaDB enforces CHECK with different semantics
 * (silently dropped on older releases, surface-syntax-only on 10.2+ until
 * 10.2.1) and has not historically been a tested target.
 */
export type ParsedMysqlVersion =
  | { vendor: 'mysql'; major: number; minor: number; patch: number; raw: string }
  | { vendor: 'mariadb'; raw: string }
  | { vendor: 'unknown'; raw: string }

/**
 * Extract `{major, minor, patch}` from a MySQL `SELECT VERSION()` result.
 *
 * Real-world version strings include vendor suffixes (`8.0.28-google`,
 * `8.0.32-cluster`, `8.4.0-1.el9`), so a leading `^(\d+)\.(\d+)\.(\d+)`
 * regex is the only reliable parse. MariaDB is detected via the literal
 * `MariaDB` substring (`10.5.13-MariaDB`) and rejected with vendor=mariadb.
 */
export function parseMysqlVersion(raw: string): ParsedMysqlVersion {
  if (raw.toLowerCase().includes('mariadb')) {
    return { vendor: 'mariadb', raw }
  }
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw)
  if (match === null) return { vendor: 'unknown', raw }
  return {
    vendor: 'mysql',
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw,
  }
}

/** True when `parsed` is a MySQL semver at or above 8.0.16. */
export function isCompatibleMysqlVersion(parsed: ParsedMysqlVersion): boolean {
  if (parsed.vendor !== 'mysql') return false
  if (parsed.major !== MIN_MAJOR) return parsed.major > MIN_MAJOR
  if (parsed.minor !== MIN_MINOR) return parsed.minor > MIN_MINOR
  return parsed.patch >= MIN_PATCH
}

/**
 * Run `SELECT VERSION()` against the pool once at boot and throw a
 * prescriptive error when the server cannot be relied on to enforce the
 * CHECK constraints declared in our schema. Vendor-aware: MariaDB is
 * rejected outright; unknown vendor strings are rejected with a hint to
 * inspect the server.
 */
export async function assertCompatibleMysql(pool: Pool): Promise<ParsedMysqlVersion> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT VERSION() AS v')
  const raw = (rows[0] as { v?: unknown } | undefined)?.v
  if (typeof raw !== 'string' || raw === '') {
    throw new Error('assertCompatibleMysql: SELECT VERSION() returned no string')
  }
  const parsed = parseMysqlVersion(raw)
  if (parsed.vendor === 'mariadb') {
    throw new Error(
      `MariaDB is not a supported backend (server reported "${raw}"). ` +
        `The schema in deploy/schema/001-init.mysql.sql relies on MySQL 8.0.16+ ` +
        `CHECK enforcement semantics. Use MySQL 8.0.16 or later.`,
    )
  }
  if (parsed.vendor === 'unknown') {
    throw new Error(
      `Could not parse MySQL server version from "${raw}". ` +
        `MysqlStore requires MySQL 8.0.16 or later (CHECK constraint enforcement).`,
    )
  }
  if (!isCompatibleMysqlVersion(parsed)) {
    throw new Error(
      `MySQL ${parsed.raw} is not supported. ` +
        `MysqlStore requires 8.0.16 or later because earlier releases silently ` +
        `parse-and-ignore CHECK constraints declared in our schema, leaving ` +
        `domain validation entirely to the application layer. Upgrade the server.`,
    )
  }
  return parsed
}
