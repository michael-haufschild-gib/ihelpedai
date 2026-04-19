import { test, expect } from '@playwright/test'

test('home page renders editor shell with coming-soon content', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-heading')).toHaveText('Coming soon')
  await expect(page.getByTestId('top-bar')).toBeVisible()
  await expect(page.getByTestId('menu-view')).toContainText('VIEW')
})
