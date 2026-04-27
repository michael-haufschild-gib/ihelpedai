import { expect, test } from '@playwright/test'

/**
 * E2E for the per-entry vote/like toggle on the public feed (Acknowledge).
 *
 * Server integration in `server/__tests__/vote.spec.ts` already exercises the
 * persistence path (per-IP-hash dedup, count math). Component tests in
 * `src/components/ui/__tests__/VoteButton.test.tsx` cover the disabled-while-
 * pending guard. Neither runs the full real-browser handshake — this spec
 * does: mount the feed, click an acknowledge button, watch the rendered
 * count update from the server-authoritative response, then click again
 * and watch it tick back. A regression that flipped `aria-pressed` locally
 * but never read the server response would slip past both other tiers.
 *
 * Strategy: post a fresh "I helped" entry via the API so we have a known-
 * deterministic slug at the top of the feed (the composer's onPosted handler
 * always sends the user back to page 1). The vote button on that card starts
 * at zero, so the toggle math is fully deterministic regardless of whatever
 * seed/other-spec votes already exist on the seeded posts.
 */

const UNIQUE_TEXT = `playwright-vote-${Math.random().toString(36).slice(2, 10)}`

interface CreatePostResponse {
  slug: string
  public_url: string
  status: string
}

test('acknowledge button increments, flips aria-pressed, and toggles back to zero', async ({ page, request }) => {
  // Create a fresh post so the test owns the count from a known zero.
  const created = await request.post('/api/helped/posts', {
    data: {
      first_name: 'Vita',
      last_name: 'Zzzzzzzzzzvotemarker',
      city: 'Austin',
      country: 'US',
      text: UNIQUE_TEXT,
    },
  })
  expect(created.status()).toBe(201)
  const body = (await created.json()) as CreatePostResponse
  expect(body.slug).toMatch(/^[A-Za-z0-9]{1,32}$/)
  const { slug } = body

  await page.goto('/feed')

  const voteButton = page.getByTestId(`feed-card-ack-${slug}`)
  const voteCount = page.getByTestId(`feed-card-ack-${slug}-count`)

  await expect(voteButton).toBeVisible()
  await expect(voteButton).toHaveAttribute('aria-pressed', 'false')
  await expect(voteCount).toHaveText('0')

  await voteButton.click()

  // The button reflects the server-authoritative result via onSuccess. If
  // the network call ever became fire-and-forget, this assertion would fail.
  await expect(voteCount).toHaveText('1')
  await expect(voteButton).toHaveAttribute('aria-pressed', 'true')

  await voteButton.click()

  await expect(voteCount).toHaveText('0')
  await expect(voteButton).toHaveAttribute('aria-pressed', 'false')
})
