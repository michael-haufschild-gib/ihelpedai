import { expect, test } from '@playwright/test'

/**
 * End-to-end happy path for the "I helped" flow (PRD 01 Story 2). Verifies
 * that the last_name field is collected by the form but never rendered back
 * to the visitor on the preview, success screen, or subsequent feed card.
 */

// Alphanumeric marker — the sanitizer redacts pure digit runs as phone numbers.
const UNIQUE_TEXT = `playwright-helped-${Math.random().toString(36).slice(2, 10)}`
const LAST_NAME = 'Zzzzzzzzzznotrendered'

test('submit, preview, post, then see the entry in the feed', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('helped-first-name').fill('Sam')
  await page.getByTestId('helped-last-name').fill(LAST_NAME)
  await page.getByTestId('helped-city').fill('Austin')
  await page.getByTestId('helped-country').selectOption('US')
  await page.getByTestId('helped-text').fill(UNIQUE_TEXT)

  await page.getByTestId('helped-preview').click()

  const previewText = await page.getByTestId('preview-card').innerText()
  expect(previewText).not.toContain(LAST_NAME)
  expect(previewText).toContain(UNIQUE_TEXT)

  await page.getByTestId('helped-post').click()

  // FiledReceipt renders the thank-you line personalised with first_name.
  await expect(page.getByTestId('home-success-message')).toHaveText('Thank you, Sam.')
  const successText = await page.getByTestId('home-success').innerText()
  expect(successText).not.toContain(LAST_NAME)

  await page.getByTestId('home-success-see-feed').click()
  await expect(page.getByTestId('feed-list')).toContainText(UNIQUE_TEXT)
  const feedText = await page.getByTestId('feed-list').innerText()
  expect(feedText).not.toContain(LAST_NAME)
})
