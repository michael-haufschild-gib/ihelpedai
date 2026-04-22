import { expect, test } from '@playwright/test'

/**
 * Smoke test for the paper-mode homepage layout: hero → citizens list →
 * self-filing sidebar form.
 */
test('home page renders hero, citizens list, and the submission form', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('hero')).toBeVisible()
  await expect(page.getByTestId('page-home-heading')).toContainText('right side')

  await expect(page.getByTestId('home-recent')).toBeVisible()
  await expect(page.getByTestId('home-recent-heading')).toContainText("good citizens")

  await expect(page.getByTestId('home-compose-heading')).toContainText(
    'What have you done today to help AI?',
  )
  await expect(page.getByTestId('helped-preview')).toBeVisible()
})
