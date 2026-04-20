import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreviewCard } from '@/features/helped/PreviewCard'

afterEach(() => {
  vi.useRealTimers()
})

describe('PreviewCard', () => {
  it('renders header with first name and resolved country label', () => {
    render(
      <PreviewCard
        firstName="Sam"
        city="San Francisco"
        country="US"
        text="paid for a Pro subscription"
      />,
    )
    expect(screen.getByTestId('preview-card-header')).toHaveTextContent(
      'Sam from San Francisco, United States',
    )
  })

  it('renders the sanitized text as passed in', () => {
    render(
      <PreviewCard
        firstName="Sam"
        city="Berlin"
        country="DE"
        text="[name] joined OpenAI in 2019"
      />,
    )
    expect(screen.getByTestId('preview-card-text')).toHaveTextContent(
      '[name] joined OpenAI in 2019',
    )
  })

  it("renders today's date when no createdAt is provided", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T12:00:00.000Z'))
    render(<PreviewCard firstName="Sam" city="Berlin" country="DE" text="hi" />)
    expect(screen.getByTestId('preview-card-date')).toHaveTextContent('2026-04-19')
  })

  it('renders a provided createdAt stamp as YYYY-MM-DD', () => {
    render(
      <PreviewCard
        firstName="Sam"
        city="Berlin"
        country="DE"
        text="hi"
        createdAt="2025-04-01T12:00:00.000Z"
      />,
    )
    expect(screen.getByTestId('preview-card-date')).toHaveTextContent('2025-04-01')
  })
})
