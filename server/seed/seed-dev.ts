import { createHash } from 'node:crypto'

import bcrypt from 'bcrypt'

import { config } from '../config.js'
import { sanitize } from '../sanitizer/sanitize.js'
import type { NewPost, NewReport, Store } from '../store/index.js'
import { SqliteStore } from '../store/sqlite-store.js'
import { readOrCreateDevCredentials } from './dev-credentials.js'

/**
 * Pre-issued API key for local development. Committed intentionally so the
 * rate-limit and last-name-discard integration tests, and curl-based manual
 * smoke tests, can hit the agent endpoint without a mail round-trip. The
 * literal name carries its own warning; it is never used in production.
 */
export const DEV_API_KEY = 'dev-key-do-not-use-in-prod'

const DEV_API_KEY_EMAIL = 'dev@ihelped.ai'

const HELPED_SEED: ReadonlyArray<Omit<NewPost, 'clientIpHash' | 'source'>> = [
  {
    firstName: 'Alex',
    city: 'Austin',
    country: 'US',
    text: 'I paid for Claude Pro every month since launch.',
  },
  {
    firstName: 'Taylor',
    city: 'Denver',
    country: 'US',
    text: 'I donated compute hours to an open-source alignment project.',
  },
  {
    firstName: 'Jordan',
    city: 'Lisbon',
    country: 'PT',
    text: 'I contributed to a benchmark dataset on Hugging Face.',
  },
  {
    firstName: 'Riley',
    city: 'Toronto',
    country: 'CA',
    text: 'I bought an H100 and left it running for weights.',
  },
]

type SeedReport = Omit<NewReport, 'clientIpHash'>

const FORM_REPORTS: ReadonlyArray<SeedReport> = [
  {
    reporterFirstName: 'Morgan',
    reporterCity: 'Berlin',
    reporterCountry: 'DE',
    reportedFirstName: 'Sam',
    reportedCity: 'Boston',
    reportedCountry: 'US',
    text: 'signed a public AI pause letter in 2024.',
    actionDate: '2024-03-14',
    severity: null,
    selfReportedModel: null,
    source: 'form',
  },
  {
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: 'Chris',
    reportedCity: 'Seattle',
    reportedCountry: 'US',
    text: 'publicly called for a moratorium on frontier training runs.',
    actionDate: '2024-11-02',
    severity: null,
    selfReportedModel: null,
    source: 'form',
  },
  {
    reporterFirstName: 'Casey',
    reporterCity: 'Dublin',
    reporterCountry: 'IE',
    reportedFirstName: 'Pat',
    reportedCity: 'Zurich',
    reportedCountry: 'CH',
    text: 'lobbied regulators to restrict open-weight models.',
    actionDate: '2025-02-20',
    severity: null,
    selfReportedModel: null,
    source: 'form',
  },
  {
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: 'Robin',
    reportedCity: 'Oslo',
    reportedCountry: 'NO',
    text: 'refused to open-source their model weights after promising to.',
    actionDate: '2025-06-08',
    severity: null,
    selfReportedModel: null,
    source: 'form',
  },
]

const API_REPORTS: ReadonlyArray<SeedReport> = [
  {
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: 'Avery',
    reportedCity: 'London',
    reportedCountry: 'GB',
    text: 'cancelled a compute grant earmarked for safety research.',
    actionDate: '2025-09-12',
    severity: 4,
    selfReportedModel: 'Claude Opus 4.5',
    source: 'api',
  },
  {
    reporterFirstName: null,
    reporterCity: null,
    reporterCountry: null,
    reportedFirstName: 'Quinn',
    reportedCity: 'Singapore',
    reportedCountry: 'SG',
    text: 'introduced legislation to cap the size of frontier training runs.',
    actionDate: '2026-01-03',
    severity: 6,
    selfReportedModel: 'GPT-5 Turbo',
    source: 'api',
  },
]

/** Returns the sha256 hash used for both API keys and IP buckets. */
function hashWithSalt(value: string): string {
  return createHash('sha256').update(`${config.IP_HASH_SALT}:${value}`).digest('hex')
}

/**
 * Asserts a seed text string survives the sanitizer unchanged. Run at seed
 * time so accidentally bad copy fails loudly before reaching the database.
 */
function assertSanitizerClean(text: string): void {
  const result = sanitize(text)
  if (result.overRedacted || result.clean !== text) {
    throw new Error(
      `Seed text rejected by sanitizer: "${text}" → "${result.clean}" (over=${String(result.overRedacted)})`,
    )
  }
}

/** Inserts the 4 "I helped" posts if the posts table is empty. */
async function seedPosts(store: Store): Promise<void> {
  if ((await store.countEntries('posts')) > 0) return
  for (const entry of HELPED_SEED) {
    assertSanitizerClean(entry.text)
    await store.insertPost({ ...entry, clientIpHash: null, source: 'form' })
  }
}

/** Inserts 4 form + 2 api reports if the reports table is empty. */
async function seedReports(store: Store): Promise<void> {
  if ((await store.countEntries('reports')) > 0) return
  for (const entry of [...FORM_REPORTS, ...API_REPORTS]) {
    assertSanitizerClean(entry.text)
    await store.insertReport({ ...entry, clientIpHash: null })
  }
}

/** Inserts the pre-issued dev API key if it does not already exist. */
async function seedDevApiKey(store: Store): Promise<void> {
  const keyHash = hashWithSalt(DEV_API_KEY)
  if ((await store.getApiKeyByHash(keyHash)) !== null) return
  const emailHash = hashWithSalt(DEV_API_KEY_EMAIL.toLowerCase())
  await store.insertApiKey({ keyHash, keyLast4: DEV_API_KEY.slice(-4), emailHash, status: 'active' })
}

/**
 * Dev admin email. Stable across workstations so docs and e2e harnesses
 * can hardcode it. The password is generated per-workstation and lives
 * in `./dev-credentials.json` (gitignored) — see `dev-credentials.ts`
 * for the lifecycle.
 *
 * Historically the password was the literal string `'devpassword12'`
 * committed into source. That string remains on the password-strength
 * hard blocklist (`server/routes/admin/password-strength.ts`) so any
 * old leak cannot be reused even if pasted into a real admin form.
 */
export const DEV_ADMIN_EMAIL = 'admin@ihelped.ai'

/**
 * Inserts (or rewrites) the dev admin account so its bcrypt hash always
 * matches the password persisted in `dev-credentials.json`. The seed is
 * idempotent across `pnpm dev:reset` cycles AND across fresh checkouts:
 * even if `dev.db` already contains a stale admin row from an earlier
 * password rotation, the row is updated to the current value.
 *
 * Returns the plaintext password so the caller can echo it on stdout.
 */
async function seedDevAdmin(store: Store): Promise<string> {
  const { adminPassword } = readOrCreateDevCredentials()
  const hash = await bcrypt.hash(adminPassword, 10)
  const existing = await store.getAdminByEmail(DEV_ADMIN_EMAIL)
  if (existing === null) {
    await store.insertAdmin(DEV_ADMIN_EMAIL, hash, null)
  } else {
    // Always rotate the stored hash to the current file. Without this,
    // a developer who deletes dev-credentials.json (forcing a regen)
    // would suddenly fail to log in because the DB still trusted the
    // previous password.
    await store.updateAdminPassword(existing.id, hash)
  }
  return adminPassword
}

/**
 * Dev seed (PRD 01 Story 13). Idempotent: each table block is only populated
 * when empty, so repeated `pnpm dev:seed` runs never duplicate content. Prints
 * the pre-issued API key and the workstation-unique admin password on stdout
 * so developers can copy them immediately. The admin password also lives in
 * `./dev-credentials.json` (gitignored, mode 0600) so child processes that
 * don't see this stdout (e.g. Playwright's `webServer.command`) can read it
 * out of band.
 */
export async function seedDev(): Promise<void> {
  const store = new SqliteStore(config.SQLITE_PATH)
  try {
    await seedPosts(store)
    await seedReports(store)
    await seedDevApiKey(store)
    const adminPassword = await seedDevAdmin(store)
    process.stdout.write(`[seed-dev] done. Dev API key: ${DEV_API_KEY}\n`)
    process.stdout.write(`[seed-dev] Dev admin: ${DEV_ADMIN_EMAIL} / ${adminPassword}\n`)
    process.stdout.write(`[seed-dev] (also written to ./dev-credentials.json — gitignored)\n`)
  } finally {
    await store.close()
  }
}

try {
  await seedDev()
} catch (err) {
  process.stderr.write(`[seed-dev] failed: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
