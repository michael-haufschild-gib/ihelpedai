import { expect, test } from '@playwright/test'

/**
 * End-to-end happy path for anonymous report submission (PRD 01 Story 4).
 * Reporter fields are left empty; reported-person fields are filled; the
 * disclaimer must be visible on the preview; success screen shows "Logged."
 */

// Alphanumeric marker — the sanitizer redacts pure digit runs as phone numbers.
const UNIQUE_TEXT = `playwright-report-${Math.random().toString(36).slice(2, 10)}`
const REPORTED_LAST_NAME = 'Zzzzzzzzzzreportsurname'

test('anonymous report flow: fill, preview, post, see in reports feed', async ({ page }) => {
  await page.goto('/reports/new')

  await page.getByTestId('rf-reported-first-name').fill('Drew')
  await page.getByTestId('rf-reported-last-name').fill(REPORTED_LAST_NAME)
  await page.getByTestId('rf-reported-city').fill('Oslo')
  await page.getByTestId('rf-reported-country').selectOption('NO')
  await page.getByTestId('rf-what-they-did').fill(UNIQUE_TEXT)

  await page.getByTestId('rf-preview-button').click()

  await expect(page.getByTestId('rf-disclaimer-preview')).toBeVisible()
  const previewText = await page.getByTestId('rf-preview').innerText()
  expect(previewText).not.toContain(REPORTED_LAST_NAME)
  expect(previewText).toContain(UNIQUE_TEXT)

  await page.getByTestId('rf-post').click()

  await expect(page.getByTestId('report-success-heading')).toHaveText('Logged.')

  await page.getByTestId('report-success-see').click()
  await expect(page.getByTestId('reports-list')).toContainText(UNIQUE_TEXT)
  const listText = await page.getByTestId('reports-list').innerText()
  expect(listText).not.toContain(REPORTED_LAST_NAME)
})
