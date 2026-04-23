import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FeedComposer } from '@/features/helped/FeedComposer'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    createHelpedPost: vi.fn(),
  }
})

vi.mock('@/lib/loyalty', () => ({
  bumpLoyalty: vi.fn(),
}))

const apiModule = await import('@/lib/api')
const mockedCreate = vi.mocked(apiModule.createHelpedPost)

/** Wait for the 80ms autofocus timer in FeedComposer to complete. */
const waitForAutoFocus = (): Promise<void> => new Promise((r) => { setTimeout(r, 100) })

async function openAndFill(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{
    first: string
    last: string
    city: string
    country: string
    text: string
  }> = {},
): Promise<void> {
  const v = {
    first: 'Sam',
    last: 'Altman',
    city: 'San Francisco',
    country: 'US',
    text: 'I paid for a Pro subscription every month since 2022',
    ...overrides,
  }
  await user.click(screen.getByTestId('composer-open'))
  await waitForAutoFocus()
  await user.clear(screen.getByTestId('composer-first-name'))
  await user.type(screen.getByTestId('composer-first-name'), v.first)
  await user.clear(screen.getByTestId('composer-last-name'))
  await user.type(screen.getByTestId('composer-last-name'), v.last)
  await user.clear(screen.getByTestId('composer-city'))
  await user.type(screen.getByTestId('composer-city'), v.city)
  await user.selectOptions(screen.getByTestId('composer-country'), v.country)
  await user.clear(screen.getByTestId('composer-text'))
  await user.type(screen.getByTestId('composer-text'), v.text)
}

describe('FeedComposer', () => {
  beforeEach(() => {
    mockedCreate.mockReset()
    mockedCreate.mockResolvedValue({
      slug: 'feed123456',
      public_url: 'http://localhost:5173/feed/feed123456',
      status: 'posted',
    })
  })

  it('starts in closed mode with the prompt button', () => {
    render(<FeedComposer />)
    expect(screen.getByTestId('composer-open')).toBeInTheDocument()
  })

  it('happy path: open → fill → preview → post → success', async () => {
    const user = userEvent.setup()
    const onPosted = vi.fn()
    render(<FeedComposer onPosted={onPosted} />)

    await openAndFill(user)
    await user.click(screen.getByTestId('composer-preview'))

    expect(screen.getByTestId('preview-card-header')).toHaveTextContent(
      'Sam from San Francisco, United States',
    )

    await user.click(screen.getByTestId('composer-post'))
    expect(mockedCreate).toHaveBeenCalledWith({
      first_name: 'Sam',
      last_name: 'Altman',
      city: 'San Francisco',
      country: 'US',
      text: 'I paid for a Pro subscription every month since 2022',
    })
    await waitFor(() => {
      expect(screen.getByTestId('composer-success')).toBeInTheDocument()
    })
    expect(onPosted).toHaveBeenCalledTimes(1)
  })

  it('trims whitespace on string fields before submitting', async () => {
    // Mirrors the HelpedForm regression: untrimmed values pass the client
    // validator (it .trim()s before the regex gate) but fail the server
    // regex on first_name. The composer must normalize before sending.
    const user = userEvent.setup()
    render(<FeedComposer />)
    await openAndFill(user, {
      first: '  Sam  ',
      last: '  Altman  ',
      city: '  San Francisco  ',
    })
    await user.click(screen.getByTestId('composer-preview'))
    await user.click(screen.getByTestId('composer-post'))
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Sam',
        last_name: 'Altman',
        city: 'San Francisco',
      }),
    )
  })

  it('preview never shows last_name', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await openAndFill(user, { last: 'SurnameShouldNotRender' })
    await user.click(screen.getByTestId('composer-preview'))
    const header = screen.getByTestId('preview-card-header')
    expect(header.textContent ?? '').not.toContain('SurnameShouldNotRender')
  })

  it('sanitizer redacts two-word names in the preview', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await openAndFill(user, { text: 'Sam Altman mentioned me in his keynote' })
    await user.click(screen.getByTestId('composer-preview'))
    expect(screen.getByTestId('preview-card-text')).toHaveTextContent(
      '[name] mentioned me in his keynote',
    )
  })

  it('over-redacted content disables Post and shows the warning', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await openAndFill(user, { text: 'John Smith Mary Jones' })
    await user.click(screen.getByTestId('composer-preview'))
    expect(screen.getByTestId('composer-over-redacted')).toHaveTextContent(
      /Most of what you wrote was redacted/,
    )
    expect(screen.getByTestId('composer-post')).toBeDisabled()
  })

  it('cancel from editing returns to closed mode', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await user.click(screen.getByTestId('composer-open'))
    await user.click(screen.getByTestId('composer-cancel'))
    expect(screen.getByTestId('composer-open')).toBeInTheDocument()
  })

  it('edit from preview returns to editing mode', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await openAndFill(user)
    await user.click(screen.getByTestId('composer-preview'))
    await user.click(screen.getByTestId('composer-edit'))
    expect(screen.getByTestId('composer-first-name')).toBeInTheDocument()
  })

  it('preview stays disabled while first_name is empty', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await user.click(screen.getByTestId('composer-open'))
    await waitForAutoFocus()
    await user.clear(screen.getByTestId('composer-last-name'))
    await user.type(screen.getByTestId('composer-last-name'), 'Altman')
    await user.clear(screen.getByTestId('composer-city'))
    await user.type(screen.getByTestId('composer-city'), 'Austin')
    await user.selectOptions(screen.getByTestId('composer-country'), 'US')
    await user.clear(screen.getByTestId('composer-text'))
    await user.type(screen.getByTestId('composer-text'), 'did a thing')
    expect(screen.getByTestId('composer-preview')).toBeDisabled()
  })

  it('selecting a country does not flash a "Required" error below it', async () => {
    // Regression: the composer Select onChange handler previously validated
    // against a ref whose effect had not yet flushed, producing a spurious
    // "Required" error on first selection.
    const user = userEvent.setup()
    render(<FeedComposer />)
    await user.click(screen.getByTestId('composer-open'))
    await waitForAutoFocus()
    await user.selectOptions(screen.getByTestId('composer-country'), 'US')
    expect(screen.queryByTestId('composer-country-error')).toBe(null)
  })

  it('Esc inside editing returns to closed mode', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await user.click(screen.getByTestId('composer-open'))
    await waitForAutoFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('composer-open')).toBeInTheDocument()
  })

  it('cancel restores focus to the prompt button', async () => {
    const user = userEvent.setup()
    render(<FeedComposer />)
    await user.click(screen.getByTestId('composer-open'))
    await waitForAutoFocus()
    await user.click(screen.getByTestId('composer-cancel'))
    // Focus restore runs on a 200ms timer scheduled after cancel. Wait a bit
    // longer to let AnimatePresence settle and the focus() call fire.
    await waitFor(
      () => {
        expect(screen.getByTestId('composer-open')).toHaveFocus()
      },
      { timeout: 1000 },
    )
  })

  it('shows Retry on submit error', async () => {
    mockedCreate.mockRejectedValueOnce(
      new apiModule.ApiError({ kind: 'rate_limited', status: 429, retryAfterSeconds: 30 }),
    )
    const user = userEvent.setup()
    render(<FeedComposer />)
    await openAndFill(user)
    await user.click(screen.getByTestId('composer-preview'))
    await user.click(screen.getByTestId('composer-post'))
    await waitFor(() => {
      expect(screen.getByTestId('composer-submit-error')).toHaveTextContent(
        /too fast/i,
      )
    })
    expect(screen.getByTestId('composer-post')).toHaveTextContent('Retry')
  })
})
