import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Read the workstation-unique dev admin password persisted by
 * `pnpm dev:seed`. Playwright's webServer command runs the seed before
 * the e2e suite executes, so this file is guaranteed to exist by the
 * time any spec touches it.
 *
 * The file is gitignored (mode 0600) and the password is regenerated on
 * every fresh checkout — there is no longer a committed plaintext
 * default. Tests that need to type the admin password into a real
 * browser call this helper at the top of each spec.
 */
export function readDevAdminPassword(): string {
  const path = resolve(process.cwd(), 'dev-credentials.json')
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as { adminPassword?: unknown }
  if (typeof parsed.adminPassword !== 'string' || parsed.adminPassword === '') {
    throw new Error(`readDevAdminPassword: ${path} is missing the adminPassword field`)
  }
  return parsed.adminPassword
}
