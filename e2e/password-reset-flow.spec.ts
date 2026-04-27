import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { readDevAdminPassword } from './_helpers/dev-credentials'

/**
 * E2E for the admin password-reset flow (PRD 02 Story 2). Server integration
 * tests in `forgot-password.spec.ts` cover the rate-limit envelope and the
 * "always 200" anti-enumeration response, but no test exercises the full
 * round-trip in a real browser: form submit → emailed token → reset form →
 * login with the new password.
 *
 * To keep the seeded `admin@ihelped.ai` credentials intact (other specs
 * depend on the seed admin still being able to log in), this spec uses the
 * seed admin's session to invite a brand-new throwaway admin via
 * `/api/admin/admins/invite`, then runs the forgot-password flow against
 * that throwaway. The throwaway admin remains in the DB but never collides
 * with anything because its email is randomized per run.
 *
 * Mail delivery in dev is the FileMailer — each outgoing email is written to
 * `tmp/mail/<timestamp>-<uuid>-<subject>.eml`. The timestamp prefix makes
 * "find the most recent message addressed to <email>" deterministic.
 */

const MAIL_DIR = resolve(process.cwd(), 'tmp', 'mail')
const SEED_ADMIN_EMAIL = 'admin@ihelped.ai'
// Workstation-unique password persisted by `pnpm dev:seed`. The legacy
// literal `'devpassword12'` is on the password-strength hard blocklist
// for leak protection and is never accepted as a real credential.
const SEED_ADMIN_PASSWORD = readDevAdminPassword()
// High-entropy passphrase that clears the zxcvbn gate in
// server/routes/admin/password-strength.ts. Keep it distinct from any
// other test password so a future copy/paste doesn't conflate flows.
const NEW_PASSWORD = 'Tug-of-Squid! 87 lobotomy boats'

interface InviteResponse {
  status: string
  id: string
}

/**
 * Reads the most recent .eml in `tmp/mail` whose `To:` header matches
 * `recipient` and `subjectFragment` (used to disambiguate the invite
 * mail from the password-reset mail when both target the same address).
 * Polls because forgot-password's mail send happens AFTER the 200 reply
 * is already on the wire — the .eml is written within milliseconds, but
 * a few worker ticks later. The 5s ceiling matches Playwright's default
 * action timeout so a real failure surfaces fast.
 */
async function readLatestMailTo(recipient: string, subjectFragment: string): Promise<string> {
  let captured = ''
  await expect
    .poll(
      async () => {
        let files: string[]
        try {
          files = (await readdir(MAIL_DIR))
            .filter((f) => f.endsWith('.eml'))
            .sort()
            .reverse()
        } catch {
          return 'no-mail-dir'
        }
        for (const file of files) {
          const raw = await readFile(resolve(MAIL_DIR, file), 'utf8')
          if (raw.includes(`To: ${recipient}`) && raw.includes(subjectFragment)) {
            captured = raw
            return 'found'
          }
        }
        return 'not-yet'
      },
      {
        timeout: 5_000,
        message: `no mail to ${recipient} matching "${subjectFragment}" within 5s`,
      },
    )
    .toBe('found')
  return captured
}

/** Extracts the `?token=…` query string value from the reset link in an email. */
function extractResetToken(emailBody: string): string {
  const match = /\/admin\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(emailBody)
  const token = match?.[1]
  if (token === undefined) throw new Error(`no reset URL in email body:\n${emailBody.slice(0, 400)}`)
  return token
}

test('forgot-password → emailed token → reset → login as the reset admin', async ({ page, request }) => {
  // 1. Sign in as the seeded admin so we can invite a throwaway target.
  const newAdminEmail = `pwreset-${randomUUID()}@ihelped.ai`
  const seedLogin = await request.post('/api/admin/login', {
    data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD },
  })
  expect(seedLogin.status()).toBe(200)

  const invite = await request.post('/api/admin/admins/invite', {
    data: { email: newAdminEmail },
  })
  expect(invite.status()).toBe(201)
  const inviteBody = (await invite.json()) as InviteResponse
  expect(inviteBody.id.length).toBeGreaterThan(0)

  // The invite mail is the first email we'll see for this address — discard
  // it, but read the file to make sure mailing is wired (otherwise the
  // forgot-password mail later would also be missing and the failure
  // would point at the wrong feature).
  const inviteEmail = await readLatestMailTo(newAdminEmail, 'Set your admin password')
  expect(inviteEmail).toContain('Set your admin password')

  // Drop the seed admin's session so the unauthenticated forgot/reset
  // flow runs the way a real user would experience it.
  await request.post('/api/admin/logout')

  // 2. Submit /admin/forgot-password as an anonymous visitor. The endpoint
  //    always responds 200; the UI flips to the "If an admin account exists…"
  //    confirmation regardless of outcome.
  await page.goto('/admin/forgot-password')
  await page.getByTestId('admin-forgot-email').fill(newAdminEmail)
  await page.getByTestId('admin-forgot-submit').click()
  await expect(page.getByTestId('admin-forgot-sent')).toBeVisible()

  // 3. Pull the reset token out of the mailbox.
  const resetEmail = await readLatestMailTo(newAdminEmail, 'Password reset')
  expect(resetEmail).toContain('Password reset')
  const token = extractResetToken(resetEmail)
  expect(token.length).toBeGreaterThan(20)

  // 4. Visit the reset page with the live token and set a new password.
  //    The high-entropy passphrase clears the password-strength gate.
  await page.goto(`/admin/reset-password?token=${token}`)
  await page.getByTestId('admin-reset-password').fill(NEW_PASSWORD)
  await page.getByTestId('admin-reset-confirm').fill(NEW_PASSWORD)
  await page.getByTestId('admin-reset-submit').click()
  await expect(page.getByTestId('admin-reset-done')).toBeVisible()

  // 5. Log in with the brand-new password. A successful login lands on
  //    /admin (the entries page), proving the reset actually changed the
  //    stored password hash and that a session cookie was issued for the
  //    target admin (not for the seed admin we briefly logged in as).
  await page.goto('/admin/login')
  await page.getByTestId('admin-login-email').fill(newAdminEmail)
  await page.getByTestId('admin-login-password').fill(NEW_PASSWORD)
  await page.getByTestId('admin-login-submit').click()
  await page.waitForURL('**/admin')
  await expect(page.getByTestId('admin-entries-page')).toBeVisible()
})

test('reset form surfaces an invalid-token error and stays on the page', async ({ page }) => {
  // Anonymous flow — no server login needed. Server integration in
  // `forgot-password.spec.ts` covers the DB branches (expired/used/missing);
  // this spec only locks that the UI surfaces a human message and keeps the
  // user on /admin/reset-password so they know to request a fresh link
  // rather than redirecting to /admin (which would feel like success).
  await page.goto('/admin/reset-password?token=this-token-was-never-issued-and-cannot-match')
  await page.getByTestId('admin-reset-password').fill(NEW_PASSWORD)
  await page.getByTestId('admin-reset-confirm').fill(NEW_PASSWORD)
  await page.getByTestId('admin-reset-submit').click()
  await expect(page.getByTestId('admin-reset-error')).toContainText(/expired|invalid|already been used/i)
  await expect(page).toHaveURL(/\/admin\/reset-password/)
})
