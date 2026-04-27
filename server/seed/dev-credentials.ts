import { randomBytes } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * On-disk dev credentials store. The file is gitignored so a workstation's
 * generated password never leaks via the source tree, and is mode 0600 so
 * other local users cannot read it.
 *
 * Why a file (not just stdout): `pnpm dev:seed` may be run repeatedly,
 * and Playwright's `dev:seed` step runs as a child process whose stdout
 * is swallowed. Persisting the password lets the e2e harness, manual
 * curl probes, and a developer's terminal all converge on the same
 * value across runs.
 */
const CREDENTIALS_FILE = resolve(process.cwd(), 'dev-credentials.json')

const FILE_MODE = 0o600

interface DevCredentials {
  /** Plaintext admin password persisted across `pnpm dev:seed` runs. */
  adminPassword: string
}

/**
 * Load the dev credentials file if present, otherwise generate a new
 * random admin password, persist it, and return the payload.
 *
 * Mode 0600 is re-applied via `chmodSync` on every call: a developer who
 * accidentally chmods the existing file back to 0644 will have it
 * tightened on the next seed. (`writeFileSync`'s `mode` option only
 * applies when the file is newly created, so the explicit chmod is the
 * only way to harden an existing file.)
 */
export function readOrCreateDevCredentials(): DevCredentials {
  const existing = tryReadCredentialsFile()
  if (existing !== null) {
    enforceCredentialsFileMode()
    return existing
  }
  const fresh: DevCredentials = { adminPassword: generateDevPassword() }
  writeCredentialsFile(fresh)
  return fresh
}

/**
 * Generate a workstation-unique dev admin password. 18 random bytes
 * encoded as base64url — 24 characters, ~108 bits of entropy. Comfortably
 * above zxcvbn's score-3 threshold without dragging in dictionary words
 * that the hard blocklist might catch.
 */
function generateDevPassword(): string {
  return randomBytes(18).toString('base64url')
}

function tryReadCredentialsFile(): DevCredentials | null {
  let raw: string
  try {
    raw = readFileSync(CREDENTIALS_FILE, 'utf8')
  } catch (error) {
    // Only "file does not exist" should fall through to regen; surfacing
    // permission/I/O errors keeps a real filesystem problem from silently
    // rotating the dev admin password each time the seed runs.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    // Malformed JSON (manual edit, partial write, truncation) is recoverable
    // by overwriting with a freshly generated credentials object.
    return null
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    typeof (parsed as { adminPassword?: unknown }).adminPassword === 'string' &&
    (parsed as { adminPassword: string }).adminPassword.length > 0
  ) {
    return parsed as DevCredentials
  }
  return null
}

function writeCredentialsFile(creds: DevCredentials): void {
  writeFileSync(CREDENTIALS_FILE, `${JSON.stringify(creds, null, 2)}\n`, {
    encoding: 'utf8',
    mode: FILE_MODE,
  })
  enforceCredentialsFileMode()
}

function enforceCredentialsFileMode(): void {
  try {
    chmodSync(CREDENTIALS_FILE, FILE_MODE)
  } catch {
    // Best-effort: a missing file (race with manual deletion) or a
    // platform without POSIX modes (Windows) should not break the seed.
  }
}
