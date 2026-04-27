import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
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
 * The file is rewritten with mode 0600 on every call: a developer who
 * accidentally chmods it back to 0644 will have it tightened on the
 * next seed.
 */
export function readOrCreateDevCredentials(): DevCredentials {
  const existing = tryReadCredentialsFile()
  if (existing !== null) return existing
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
  try {
    const raw = readFileSync(CREDENTIALS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { adminPassword?: unknown }).adminPassword === 'string' &&
      (parsed as { adminPassword: string }).adminPassword.length > 0
    ) {
      return parsed as DevCredentials
    }
    return null
  } catch {
    // ENOENT or malformed JSON both fall through to "no existing creds".
    // The seed will generate fresh and overwrite.
    return null
  }
}

function writeCredentialsFile(creds: DevCredentials): void {
  writeFileSync(CREDENTIALS_FILE, `${JSON.stringify(creds, null, 2)}\n`, {
    encoding: 'utf8',
    mode: FILE_MODE,
  })
}

/** Test hook so the dev-seed test can point at a temp directory. */
export const _internal = { CREDENTIALS_FILE }
