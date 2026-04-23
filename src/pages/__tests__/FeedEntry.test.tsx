import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '@/lib/api'
import { FeedEntry } from '@/pages/FeedEntry'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getHelpedPost: vi.fn(),
    fetchMyVotes: vi.fn(),
  }
})

const mockedGet = vi.mocked(api.getHelpedPost)
const mockedVotes = vi.mocked(api.fetchMyVotes)

function buildPost(overrides: Partial<api.HelpedPost> = {}): api.HelpedPost {
  return {
    slug: 'post-abc',
    first_name: 'Sam',
    city: 'Austin',
    country: 'US',
    text: 'sponsored an alignment review',
    like_count: 3,
    created_at: '2026-04-23T12:00:00Z',
    ...overrides,
  }
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/feed/:slug" element={<FeedEntry />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FeedEntry', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedVotes.mockReset()
    mockedVotes.mockResolvedValue({ voted: [] })
  })

  it('renders the loading state before the fetch resolves', () => {
    // An unresolved promise keeps the component in 'loading' so we can
    // assert the intermediate state before it transitions.
    mockedGet.mockReturnValueOnce(new Promise(() => undefined))
    renderAt('/feed/post-abc')
    expect(screen.getByTestId('feed-entry-loading')).toHaveTextContent(/Loading/)
  })

  it('renders the post via FeedCard after the fetch resolves', async () => {
    mockedGet.mockResolvedValueOnce(buildPost({ first_name: 'Lee', city: 'Paris' }))
    renderAt('/feed/post-abc')
    await waitFor(() => {
      expect(screen.getByTestId('feed-entry-copy-link')).toBeInTheDocument()
    })
    // FeedCard renders the first_name + city in its header; locating by
    // testid keeps the assertion decoupled from the exact UI string.
    const section = screen.getByTestId('page-feed-entry')
    expect(section.textContent ?? '').toContain('Lee')
    expect(section.textContent ?? '').toContain('Paris')
  })

  it('renders a Not-Here message when the post 404s', async () => {
    mockedGet.mockRejectedValueOnce(
      new api.ApiError({ kind: 'invalid_input', status: 404, message: 'not_found' }),
    )
    renderAt('/feed/missing')
    await waitFor(() => {
      expect(screen.getByTestId('page-feed-entry-not-found')).toBeInTheDocument()
    })
    // The "Back to the feed" link should remain discoverable even on 404.
    expect(screen.getByTestId('feed-entry-back-link')).toHaveAttribute('href', '/feed')
  })

  it('renders the generic error message on non-404 failures', async () => {
    mockedGet.mockRejectedValueOnce(
      new api.ApiError({ kind: 'internal_error', status: 500, message: 'boom' }),
    )
    renderAt('/feed/post-abc')
    await waitFor(() => {
      expect(screen.getByTestId('feed-entry-error')).toBeInTheDocument()
    })
  })

  it('renders the Copy link button once the post is loaded', async () => {
    mockedGet.mockResolvedValueOnce(buildPost())
    renderAt('/feed/post-abc')
    // The copy button only renders after state transitions to `ready`,
    // which locks the happy-path render sequence. Clipboard interaction
    // itself is not asserted — happy-dom's navigator.clipboard stubbing
    // is brittle across versions and clipboard behavior is covered by
    // a Playwright e2e instead.
    const btn = await screen.findByTestId('feed-entry-copy-link')
    expect(btn).toHaveTextContent('Copy link')
  })
})
