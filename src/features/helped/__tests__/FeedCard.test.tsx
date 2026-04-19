import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'

import { FeedCard } from '@/features/helped/FeedCard'
import type { HelpedPost } from '@/lib/api'

const samplePost: HelpedPost = {
  slug: 'abc1234567',
  first_name: 'Sam',
  city: 'San Francisco',
  country: 'US',
  text: 'I paid for a Pro subscription',
  like_count: 0,
  created_at: '2025-04-15T09:30:00.000Z',
}

function renderCard(post: HelpedPost = samplePost, query?: string) {
  return render(
    <MemoryRouter>
      <FeedCard post={post} query={query} />
    </MemoryRouter>,
  )
}

describe('FeedCard', () => {
  it('renders the header with first name, city, and country label', () => {
    renderCard()
    expect(screen.getByTestId('feed-card-header-abc1234567')).toHaveTextContent(
      'Sam from San Francisco, United States',
    )
  })

  it('renders the stored text verbatim', () => {
    renderCard()
    expect(screen.getByTestId('feed-card-text-abc1234567')).toHaveTextContent(
      'I paid for a Pro subscription',
    )
  })

  it('formats the created_at timestamp as YYYY-MM-DD', () => {
    renderCard()
    expect(screen.getByTestId('feed-card-date-abc1234567')).toHaveTextContent('2025-04-15')
  })

  it('emits a permalink pointing at /feed/<slug>', () => {
    renderCard()
    expect(screen.getByTestId('feed-card-permalink-abc1234567')).toHaveAttribute(
      'href',
      '/feed/abc1234567',
    )
  })

  it('preserves the visible text when a search query matches part of it', () => {
    renderCard(samplePost, 'Sam')
    // The header still reads the full sentence; highlighting just wraps spans.
    expect(screen.getByTestId('feed-card-header-abc1234567')).toHaveTextContent(
      'Sam from San Francisco, United States',
    )
  })
})
