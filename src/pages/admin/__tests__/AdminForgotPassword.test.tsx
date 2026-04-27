import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return { ...actual, forgotPassword: vi.fn() }
})

import * as adminApi from '@/lib/adminApi'
import { ApiError } from '@/lib/api'
import { AdminForgotPassword } from '@/pages/admin/AdminForgotPassword'

const mockedForgot = vi.mocked(adminApi.forgotPassword)

function renderForgot(): void {
  render(
    <MemoryRouter>
      <AdminForgotPassword />
    </MemoryRouter>,
  )
}

describe('AdminForgotPassword', () => {
  beforeEach(() => {
    mockedForgot.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form on mount with the back-to-login link', () => {
    renderForgot()
    expect(screen.getByTestId('admin-forgot-form')).toBeInTheDocument()
    expect(screen.getByTestId('admin-back-to-login')).toHaveAttribute('href', '/admin/login')
  })

  it('submits the email + flips to "sent" state on a successful POST', async () => {
    mockedForgot.mockResolvedValueOnce({
      message: 'If an admin account exists for this email, a reset link has been sent.',
    })
    renderForgot()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-forgot-email'), 'admin@admin.ai')
    await user.click(screen.getByTestId('admin-forgot-submit'))

    await waitFor(() => {
      expect(mockedForgot).toHaveBeenCalledWith('admin@admin.ai')
    })
    await waitFor(() => {
      expect(screen.getByTestId('admin-forgot-sent')).toBeInTheDocument()
    })
    // The form is replaced by the sent state — locking that the form
    // doesn't co-exist with the success copy (otherwise a user could
    // re-submit and hit the throttle).
    expect(screen.queryByTestId('admin-forgot-form')).toBe(null)
  })

  it('still flips to "sent" state on a 429 / 500 / network error (intentional information-leak guard)', async () => {
    // The PRD locks this: the user sees the same "if an account exists"
    // message regardless of outcome, so an attacker can't probe which
    // emails exist on the admin roster by reading the response copy or
    // the response code. Lock the swallowed-error path here so a future
    // refactor that surfaced errors would fail this test.
    mockedForgot.mockRejectedValueOnce(new ApiError({ kind: 'rate_limited', status: 429 }))
    renderForgot()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-forgot-email'), 'admin@admin.ai')
    await user.click(screen.getByTestId('admin-forgot-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-forgot-sent')).toBeInTheDocument()
    })
  })

  it('disables the submit button while the POST is in flight', async () => {
    let resolveForgot!: () => void
    mockedForgot.mockReturnValueOnce(
      new Promise<{ message: string }>((res) => {
        resolveForgot = () => res({ message: 'sent' })
      }),
    )
    renderForgot()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-forgot-email'), 'admin@admin.ai')
    await user.click(screen.getByTestId('admin-forgot-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-forgot-submit')).toBeDisabled()
    })
    resolveForgot()
    await waitFor(() => {
      expect(screen.getByTestId('admin-forgot-sent')).toBeInTheDocument()
    })
  })
})
