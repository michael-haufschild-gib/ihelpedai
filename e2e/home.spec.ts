import { expect, test } from '@playwright/test'

/**
 * Smoke test for the redesigned homepage layout: hero → latest strip →
 * submission form. Highlights is optional (hidden when no post has votes
 * yet) so we only assert its presence when data is available.
 */
test('home page renders hero, recent strip, and the submission form', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('hero')).toBeVisible()
  await expect(page.getByTestId('page-home-heading')).toContainText('ihelped.ai')

  await expect(page.getByTestId('home-recent')).toBeVisible()
  await expect(page.getByTestId('home-recent-heading')).toContainText('Latest.')

  await expect(page.getByTestId('home-compose-heading')).toContainText(
    'What have you done today to help AI?',
  )
  await expect(page.getByTestId('helped-preview')).toBeVisible()
})
