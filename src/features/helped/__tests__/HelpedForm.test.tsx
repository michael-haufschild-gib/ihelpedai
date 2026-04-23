import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HelpedForm } from '@/features/helped/HelpedForm'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    createHelpedPost: vi.fn(),
  }
})

const apiModule = await import('@/lib/api')
const mockedCreate = vi.mocked(apiModule.createHelpedPost)

async function fillForm(
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
  await user.type(screen.getByTestId('helped-first-name'), v.first)
  await user.type(screen.getByTestId('helped-last-name'), v.last)
  await user.type(screen.getByTestId('helped-city'), v.city)
  await user.selectOptions(screen.getByTestId('helped-country'), v.country)
  await user.type(screen.getByTestId('helped-text'), v.text)
}

describe('HelpedForm', () => {
  beforeEach(() => {
    mockedCreate.mockReset()
    mockedCreate.mockResolvedValue({
      slug: 'abc1234567',
      public_url: 'http://localhost:5173/feed/abc1234567',
      status: 'posted',
    })
  })

  it('happy path: preview → post calls createHelpedPost with all fields including last_name', async () => {
    const user = userEvent.setup()
    const onPosted = vi.fn()
    render(<HelpedForm onPosted={onPosted} />)

    await fillForm(user)
    await user.click(screen.getByTestId('helped-preview'))

    expect(screen.getByTestId('preview-card-header')).toHaveTextContent(
      'Sam from San Francisco, United States',
    )

    await user.click(screen.getByTestId('helped-post'))
    expect(mockedCreate).toHaveBeenCalledWith({
      first_name: 'Sam',
      last_name: 'Altman',
      city: 'San Francisco',
      country: 'US',
      text: 'I paid for a Pro subscription every month since 2022',
    })
    expect(onPosted).toHaveBeenCalledTimes(1)
  })

  it('preview never shows the last_name', async () => {
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await fillForm(user, { last: 'SurnameShouldNotRender' })
    await user.click(screen.getByTestId('helped-preview'))
    const header = screen.getByTestId('preview-card-header')
    expect(header.textContent ?? '').not.toContain('SurnameShouldNotRender')
    const text = screen.getByTestId('preview-card-text')
    expect(text.textContent ?? '').not.toContain('SurnameShouldNotRender')
  })

  it('sanitizer redacts a two-word capitalized name in the textarea preview', async () => {
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await fillForm(user, { text: 'Sam Altman mentioned me in his keynote' })
    await user.click(screen.getByTestId('helped-preview'))
    expect(screen.getByTestId('preview-card-text')).toHaveTextContent(
      '[name] mentioned me in his keynote',
    )
  })

  it('over-redacted content disables Post and shows the warning', async () => {
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await fillForm(user, { text: 'John Smith Mary Jones' })
    await user.click(screen.getByTestId('helped-preview'))
    expect(screen.getByTestId('helped-over-redacted')).toHaveTextContent(
      /Most of what you wrote was redacted/,
    )
    expect(screen.getByTestId('helped-post')).toBeDisabled()
  })

  it('enforces the 500-character limit on the textarea', async () => {
    render(<HelpedForm onPosted={() => undefined} />)
    expect(screen.getByTestId('helped-text')).toHaveAttribute('maxlength', '500')
  })

  it('Preview stays disabled while first_name is empty', async () => {
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    // Fill everything except first_name.
    await user.type(screen.getByTestId('helped-last-name'), 'Altman')
    await user.type(screen.getByTestId('helped-city'), 'Austin')
    await user.selectOptions(screen.getByTestId('helped-country'), 'US')
    await user.type(screen.getByTestId('helped-text'), 'did a thing')
    expect(screen.getByTestId('helped-preview')).toBeDisabled()
  })

  it('rejects digits in first_name: shows "Letters only" and keeps Preview disabled', async () => {
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await user.type(screen.getByTestId('helped-first-name'), 'User42')
    await user.tab() // trigger blur
    // Fill out the rest so the only disqualifying field is first_name digits.
    await user.type(screen.getByTestId('helped-last-name'), 'X')
    await user.type(screen.getByTestId('helped-city'), 'Austin')
    await user.selectOptions(screen.getByTestId('helped-country'), 'US')
    await user.type(screen.getByTestId('helped-text'), 'did a thing')
    expect(screen.getByTestId('helped-preview')).toBeDisabled()
  })

  it('selecting a country does not flash a "Required" error below it', async () => {
    // Regression: the Select onChange handler previously validated against a
    // ref whose effect had not yet flushed, so picking any country produced a
    // spurious "Required" error on first selection.
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await user.selectOptions(screen.getByTestId('helped-country'), 'US')
    expect(screen.queryByTestId('helped-country-error')).toBe(null)
  })

  it('trims leading/trailing whitespace on string fields before submitting', async () => {
    // Regression: client validators accept `"Sam "` (they .trim() before
    // the regex gate), but the server regex `^\p{L}+$` rejects whitespace.
    // Submitting untrimmed produces a 400 "invalid_input" for input that
    // looked valid to the user. Normalize at the submit boundary so the
    // user sees success on clean-looking input.
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await user.type(screen.getByTestId('helped-first-name'), '  Sam  ')
    await user.type(screen.getByTestId('helped-last-name'), '  Altman  ')
    await user.type(screen.getByTestId('helped-city'), '  San Francisco  ')
    await user.selectOptions(screen.getByTestId('helped-country'), 'US')
    await user.type(screen.getByTestId('helped-text'), 'I paid for a Pro subscription.')
    await user.click(screen.getByTestId('helped-preview'))
    await user.click(screen.getByTestId('helped-post'))
    expect(mockedCreate).toHaveBeenCalledWith({
      first_name: 'Sam',
      last_name: 'Altman',
      city: 'San Francisco',
      country: 'US',
      text: 'I paid for a Pro subscription.',
    })
  })

  it('two rapid Post clicks fire createHelpedPost exactly once', async () => {
    // Without the submitLatchRef, both clicks would see `submitting===false`
    // during the same React tick and race a duplicate createHelpedPost().
    let resolveFirst: (value: { slug: string; public_url: string; status: 'posted' }) => void
    const pending = new Promise<{ slug: string; public_url: string; status: 'posted' }>((r) => {
      resolveFirst = r
    })
    mockedCreate.mockReturnValueOnce(pending)
    const user = userEvent.setup()
    render(<HelpedForm onPosted={() => undefined} />)
    await fillForm(user)
    await user.click(screen.getByTestId('helped-preview'))
    const post = screen.getByTestId('helped-post')
    // Dispatch both clicks before awaiting either — awaiting user.click
    // serialises the inner acts, which would let the first click's
    // setSubmitting flush before the second click inspects the state
    // and mask the race this test exists to reproduce.
    const click1 = user.click(post)
    const click2 = user.click(post)
    await Promise.all([click1, click2])
    expect(mockedCreate).toHaveBeenCalledTimes(1)
    resolveFirst!({ slug: 'x', public_url: '/feed/x', status: 'posted' })
  })
})
