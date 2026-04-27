import { expect, test } from '@playwright/test'

/**
 * End-to-end happy path for the inline feed composer (PRD 01 Story 2
 * alternative surface). Verifies that the composer opens, collects input,
 * shows a preview without last_name, posts successfully, and offers a
 * "Post another" action.
 */

const UNIQUE_TEXT = `playwright-composer-${Math.random().toString(36).slice(2, 10)}`
const LAST_NAME = 'Zzzzzzzzzzcomposermarker'

test('feed composer: open, fill, preview, post, success', async ({ page }) => {
  await page.goto('/feed')

  await page.getByTestId('composer-open').click()
  await expect(page.getByTestId('composer-text')).toBeFocused()

  await page.getByTestId('composer-first-name').fill('Sam')
  await page.getByTestId('composer-last-name').fill(LAST_NAME)
  await page.getByTestId('composer-city').fill('Austin')
  await page.getByTestId('composer-country').selectOption('US')
  await page.getByTestId('composer-text').fill(UNIQUE_TEXT)

  await page.getByTestId('composer-preview').click()

  const previewText = await page.getByTestId('preview-card').innerText()
  expect(previewText).not.toContain(LAST_NAME)
  expect(previewText).toContain(UNIQUE_TEXT)

  await page.getByTestId('composer-post').click()

  await expect(page.getByTestId('composer-success')).toContainText('Posted.')
  await expect(page.getByTestId('composer-success-another')).toBeVisible()

  await page.getByTestId('composer-success-another').click()
  await expect(page.getByTestId('feed-list')).toContainText(UNIQUE_TEXT)
})
