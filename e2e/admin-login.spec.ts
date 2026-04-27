import { expect, test } from '@playwright/test'

/**
 * E2E happy path for /admin/login (PRD 02 Story 1).
 *
 * Verifies the full session round-trip in a real browser:
 *   - login form posts credentials
 *   - cookie is stored httpOnly + signed (browser drops it on subsequent
 *     requests automatically)
 *   - successful login navigates to /admin (entries list)
 *   - the entries page renders the auth-gated list, proving the cookie
 *     authenticated /api/admin/me + /api/admin/entries
 *
 * The dev seed (pnpm dev:seed, run by playwright.config webServer) plants
 * the admin account `admin@ihelped.ai / devpassword12`. The blocklist
 * password lives in server/seed/seed-dev.ts as DEV_ADMIN_PASSWORD.
 */
test('admin login → entries list', async ({ page }) => {
  await page.goto('/admin/login')

  await page.getByTestId('admin-login-email').fill('admin@ihelped.ai')
  await page.getByTestId('admin-login-password').fill('devpassword12')
  await page.getByTestId('admin-login-submit').click()

  // Successful login replaces the URL with /admin and renders the
  // auth-gated entries page. Watch for the table testid rather than
  // a copy string so the assertion survives nav-bar copy changes.
  await page.waitForURL('**/admin')
  await expect(page.getByTestId('admin-entries-page')).toBeVisible()
})

test('admin login wrong password → error stays on /admin/login', async ({ page }) => {
  await page.goto('/admin/login')

  await page.getByTestId('admin-login-email').fill('admin@ihelped.ai')
  await page.getByTestId('admin-login-password').fill('definitelywrong12345')
  await page.getByTestId('admin-login-submit').click()

  // The page surfaces the generic "Email or password is incorrect."
  // copy and the URL must NOT navigate away. A regression that
  // accidentally redirected on 401 would leak the failure as success.
  await expect(page.getByTestId('admin-login-error')).toContainText('Email or password is incorrect.')
  await expect(page).toHaveURL(/\/admin\/login$/)
  // Password input is cleared so a re-tap of Enter doesn't replay the
  // same wrong password (locks one of the unit-tested behaviours from
  // src/pages/admin/__tests__/AdminLogin.test.tsx in an actual browser).
  await expect(page.getByTestId('admin-login-password')).toHaveValue('')
})
