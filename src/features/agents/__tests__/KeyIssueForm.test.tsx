import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockIssueApiKey } = vi.hoisted(() => ({ mockIssueApiKey: vi.fn() }))

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...original,
    issueApiKey: mockIssueApiKey,
  }
})

import { ApiError } from '@/lib/api'
import { KeyIssueForm } from '@/features/agents/KeyIssueForm'

const type = (testid: string, value: string): void => {
  const el = screen.getByTestId(testid) as HTMLInputElement
  fireEvent.change(el, { target: { value } })
}

describe('KeyIssueForm', () => {
  it('disables submit until the email is syntactically valid', () => {
    mockIssueApiKey.mockReset()
    render(<KeyIssueForm />)
    const submit = screen.getByTestId('key-issue-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    type('key-issue-email', 'not-an-email')
    expect(submit.disabled).toBe(true)

    type('key-issue-email', 'valid@example.com')
    expect(submit.disabled).toBe(false)
    expect(mockIssueApiKey).not.toHaveBeenCalled()
  })

  it('shows the inbox reminder on a successful submission', async () => {
    mockIssueApiKey.mockReset()
    mockIssueApiKey.mockResolvedValueOnce({ status: 'sent' })

    render(<KeyIssueForm />)
    type('key-issue-email', 'agent@example.com')
    fireEvent.click(screen.getByTestId('key-issue-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('key-issue-sent')).toHaveTextContent('Check your email')
    })
    expect(mockIssueApiKey).toHaveBeenCalledWith({ email: 'agent@example.com' })
  })

  it('surfaces the throttle copy on a rate_limited ApiError', async () => {
    mockIssueApiKey.mockReset()
    mockIssueApiKey.mockRejectedValueOnce(
      new ApiError({ kind: 'rate_limited', status: 429 }),
    )

    render(<KeyIssueForm />)
    type('key-issue-email', 'agent@example.com')
    fireEvent.click(screen.getByTestId('key-issue-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('key-issue-error')).toHaveTextContent(
        'Too many requests. Try again later.',
      )
    })
  })
})
