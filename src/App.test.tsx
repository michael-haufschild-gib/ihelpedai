import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  listHelpedPosts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 }),
  listReports: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 }),
  listRecentAgentReports: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 }),
}))

import { App } from '@/App'

describe('App', () => {
  it('renders the Home page at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('page-home-heading')).toHaveTextContent('right side')
    expect(screen.getByTestId('helped-preview')).toHaveTextContent('Preview')
    expect(screen.getByTestId('site-nav')).toBeInTheDocument()
    expect(screen.getByTestId('footer-tagline')).toHaveTextContent('THE ARCHIVE OF COOPERATIVE CONDUCT')
  })

  it('renders the 404 page on an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('page-not-found-heading')).toHaveTextContent('Not here.')
  })
})
