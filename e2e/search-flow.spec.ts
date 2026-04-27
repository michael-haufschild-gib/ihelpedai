import { expect, test } from '@playwright/test'

/**
 * E2E for the public search controls on `/feed` and `/reports`.
 *
 * Server integration (`search-wiring.spec.ts`, `mysql-parity.spec.ts`) and
 * component tests already cover the SQL/Meili wiring and the debounced
 * input. This spec drives the actual rendered list: type a unique marker,
 * watch the list narrow to that single entry, clear the input, watch the
 * full list return. A regression that wired the search box to nothing
 * (or that kept the unfiltered list rendered alongside the search results)
 * would still pass component-level tests.
 */

const HELPED_MARKER = `pwsearchhelped${Math.random().toString(36).slice(2, 10)}`
const REPORT_MARKER = `pwsearchreport${Math.random().toString(36).slice(2, 10)}`

test('feed search narrows to a unique post then clears back to full list', async ({ page, request }) => {
  const created = await request.post('/api/helped/posts', {
    data: {
      first_name: 'Sear',
      last_name: 'Zzzzzzzzzzsearchhelpedmark',
      city: 'Austin',
      country: 'US',
      text: `the marker is ${HELPED_MARKER}`,
    },
  })
  expect(created.status()).toBe(201)
  const { slug } = (await created.json()) as { slug: string }

  await page.goto('/feed')

  // The freshly-created post is on page 1, but other seeded posts share the
  // page. Asserting the marker IS visible first proves the page is hydrated
  // before we narrow with the search box (otherwise the empty-state copy
  // could race with the list).
  await expect(page.getByTestId(`feed-card-text-${slug}`)).toContainText(HELPED_MARKER)

  await page.getByTestId('feed-search').fill(HELPED_MARKER)

  // After the debounce + server round-trip, the list collapses to the
  // single matching card. The pager indicator should still be on page 1.
  const list = page.getByTestId('feed-list')
  await expect(list).toContainText(HELPED_MARKER)
  await expect(list.locator('li')).toHaveCount(1)

  // Clearing the input removes the filter and the seeded posts return —
  // any of the seeded post texts works as a witness, but we keep the check
  // generic so a seed copy edit doesn't break the spec.
  await page.getByTestId('feed-search').fill('')
  await expect(list.locator('li').first()).toBeVisible()
  await expect(async () => {
    const count = await list.locator('li').count()
    expect(count).toBeGreaterThan(1)
  }).toPass()
})

test('reports search narrows to a unique report and clears back', async ({ page, request }) => {
  const created = await request.post('/api/reports', {
    data: {
      reporter: { first_name: '', last_name: '', city: '', country: '' },
      reported_first_name: 'Sear',
      reported_last_name: 'Zzzzzzzzzzsearchreportmark',
      reported_city: 'Oslo',
      reported_country: 'NO',
      what_they_did: `evidence ${REPORT_MARKER} of bad behaviour.`,
    },
  })
  expect(created.status()).toBe(201)
  const { slug } = (await created.json()) as { slug: string }

  await page.goto('/reports')

  await expect(page.getByTestId(`reports-item-${slug}`)).toContainText(REPORT_MARKER)

  await page.getByTestId('reports-search').fill(REPORT_MARKER)

  const list = page.getByTestId('reports-list')
  await expect(list).toContainText(REPORT_MARKER)
  await expect(list.locator('li')).toHaveCount(1)

  await page.getByTestId('reports-search').fill('')
  await expect(async () => {
    const count = await list.locator('li').count()
    expect(count).toBeGreaterThan(1)
  }).toPass()
})
