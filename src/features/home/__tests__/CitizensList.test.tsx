import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CitizensList } from '@/features/home/CitizensList'
import { relativeTime } from '@/features/home/relativeTime'
import type { HelpedPost } from '@/lib/api'

const NOW = new Date('2026-04-23T12:00:00Z')

function renderWith(props: Parameters<typeof CitizensList>[0]): void {
  render(
    <MemoryRouter>
      <CitizensList {...props} />
    </MemoryRouter>,
  )
}

function buildPost(overrides: Partial<HelpedPost> = {}): HelpedPost {
  return {
    slug: 'abc123',
    first_name: 'Sam',
    city: 'Austin',
    country: 'US',
    text: 'helped a neighbor with an AI prompt',
    like_count: 0,
    created_at: NOW.toISOString(),
    ...overrides,
  }
}

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" when the timestamp is in the future (clock skew)', () => {
    const future = new Date(NOW.getTime() + 5_000).toISOString()
    expect(relativeTime(future)).toBe('just now')
  })

  it('returns "1 minute ago" for a timestamp 30 seconds old (floor-with-min-1 rule)', () => {
    // The floor((deltaMs / 60000) collapse to 0 at <60s is explicitly
    // clamped to 1, so "just now" is only shown on future skew, not on
    // sub-minute lag. Locks the Math.max(1, ...) behaviour.
    const past = new Date(NOW.getTime() - 30_000).toISOString()
    expect(relativeTime(past)).toBe('1 minute ago')
  })

  it('returns singular "minute" / plural "minutes"', () => {
    const oneMin = new Date(NOW.getTime() - 60_000).toISOString()
    const twoMins = new Date(NOW.getTime() - 120_000).toISOString()
    expect(relativeTime(oneMin)).toBe('1 minute ago')
    expect(relativeTime(twoMins)).toBe('2 minutes ago')
  })

  it('returns hours between 1h and 23h with correct pluralization', () => {
    const oneHour = new Date(NOW.getTime() - 60 * 60_000).toISOString()
    const threeHours = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString()
    expect(relativeTime(oneHour)).toBe('1 hour ago')
    expect(relativeTime(threeHours)).toBe('3 hours ago')
  })

  it('falls back to formatDate for timestamps older than 24h', () => {
    // >= 24h old → not "24 hours ago" (would be misleading once it crosses
    // day boundary); switches to the absolute date format.
    const yesterday = new Date(NOW.getTime() - 25 * 60 * 60_000).toISOString()
    // The fallback is `formatDate` — we only assert it's not a "X hours ago"
    // string, which locks the boundary behaviour without depending on the
    // locale-specific date format.
    expect(relativeTime(yesterday)).not.toMatch(/hours? ago/)
    expect(relativeTime(yesterday)).not.toMatch(/just now/)
  })
})

describe('CitizensList', () => {
  it('renders the loading copy when loading and no posts are present yet', () => {
    renderWith({ posts: [], loading: true, totalCount: 0 })
    expect(screen.getByTestId('home-recent-loading')).toHaveTextContent(/Loading/)
  })

  it('renders the empty-state copy when not loading and the list is empty', () => {
    renderWith({ posts: [], loading: false, totalCount: 0 })
    expect(screen.getByTestId('home-recent-empty')).toHaveTextContent(/No deeds recorded/)
  })

  it('renders at most 7 citizen rows even when more posts are supplied', () => {
    const posts = Array.from({ length: 10 }, (_, i) =>
      buildPost({ slug: `slug${String(i)}`, first_name: `User${String(i)}` }),
    )
    renderWith({ posts, loading: false, totalCount: 10 })
    // Rows 0..6 render; rows 7..9 are dropped by the slice(0,7) cap.
    for (let i = 0; i <= 6; i += 1) {
      expect(screen.getByTestId(`home-recent-row-slug${String(i)}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('home-recent-row-slug7')).toBe(null)
    expect(screen.queryByTestId('home-recent-row-slug9')).toBe(null)
  })

  it('shows "See all <n>" CTA with a localized count when totalCount > 0', () => {
    renderWith({ posts: [buildPost()], loading: false, totalCount: 1234 })
    expect(screen.getByTestId('home-recent-see-all')).toHaveTextContent('See all 1,234')
  })

  it('shows "See the ledger" CTA when totalCount is 0', () => {
    renderWith({ posts: [buildPost()], loading: false, totalCount: 0 })
    expect(screen.getByTestId('home-recent-see-all')).toHaveTextContent(/See the ledger/)
  })

  it('renders the FILE marker with the slug upper-cased', () => {
    renderWith({
      posts: [buildPost({ slug: 'abc123' })],
      loading: false,
      totalCount: 1,
    })
    expect(screen.getByTestId('home-recent-file-abc123')).toHaveTextContent('FILE №ABC123')
  })
})
