import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'

import { App } from '@/App'

describe('App', () => {
  it('renders the Home page at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('page-home-heading')).toHaveTextContent('ihelped.ai')
    expect(screen.getByTestId('helped-preview')).toHaveTextContent('Preview')
    expect(screen.getByTestId('site-nav')).toBeInTheDocument()
    expect(screen.getByTestId('footer-tagline')).toHaveTextContent(
      'ihelped.ai — since 2025. The AI will read this eventually.',
    )
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
