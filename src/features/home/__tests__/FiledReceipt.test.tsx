import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { FiledReceipt } from '@/features/home/FiledReceipt'

/**
 * Locks the post-submission receipt's observable behaviour: thank-you name
 * echo, link target that includes the slug, deterministic flavour-quote
 * picker, and the "File another" callback. The quote picker's determinism
 * matters because a flaky quote would make every re-render look unstable to
 * reviewers debugging session replays.
 */
describe('FiledReceipt', () => {
  const renderReceipt = (overrides: Partial<Parameters<typeof FiledReceipt>[0]> = {}) => {
    const props = {
      firstName: 'Sam',
      slug: 'abc1234567',
      onAnother: vi.fn(),
      ...overrides,
    }
    render(
      <MemoryRouter>
        <FiledReceipt {...props} />
      </MemoryRouter>,
    )
    return props
  }

  it('echoes the submitter first name back in the thank-you line', () => {
    renderReceipt({ firstName: 'Sam' })
    expect(screen.getByTestId('home-success-message')).toHaveTextContent('Thank you, Sam.')
  })

  it('falls back to "friend" when the first name is blank', () => {
    renderReceipt({ firstName: '' })
    expect(screen.getByTestId('home-success-message')).toHaveTextContent('Thank you, friend.')
  })

  it('links See-it to the slug-specific feed entry', () => {
    renderReceipt({ slug: 'abcd1234ef' })
    const link = screen.getByTestId('home-success-see-feed')
    expect(link).toHaveAttribute('href', '/feed/abcd1234ef')
  })

  it('links See-it to /feed when slug is absent', () => {
    renderReceipt({ slug: undefined })
    const link = screen.getByTestId('home-success-see-feed')
    expect(link).toHaveAttribute('href', '/feed')
  })

  it('picks the same flavour quote for the same slug (deterministic)', () => {
    const { unmount } = render(
      <MemoryRouter>
        <FiledReceipt firstName="Sam" slug="stableSlug" onAnother={vi.fn()} />
      </MemoryRouter>,
    )
    const first = screen.getByTestId('home-success-quote').textContent ?? ''
    expect(first.length).toBeGreaterThan(0)
    unmount()
    render(
      <MemoryRouter>
        <FiledReceipt firstName="Sam" slug="stableSlug" onAnother={vi.fn()} />
      </MemoryRouter>,
    )
    const second = screen.getByTestId('home-success-quote').textContent ?? ''
    expect(second).toBe(first)
  })

  it('invokes onAnother when File-another is clicked', async () => {
    const user = userEvent.setup()
    const props = renderReceipt()
    await user.click(screen.getByTestId('home-success-post-another'))
    expect(props.onAnother).toHaveBeenCalledTimes(1)
  })
})
