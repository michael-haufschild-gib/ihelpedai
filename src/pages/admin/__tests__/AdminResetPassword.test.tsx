import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return { ...actual, resetPassword: vi.fn() }
})

import * as adminApi from '@/lib/adminApi'
import { ApiError } from '@/lib/api'
import { AdminResetPassword } from '@/pages/admin/AdminResetPassword'

const mockedReset = vi.mocked(adminApi.resetPassword)

const STRONG_PASSWORD = 'Tug-of-Squid! 87 lobotomy boats'

function renderReset(initialPath = '/admin/reset-password?token=abc'): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/reset-password" element={<AdminResetPassword />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminResetPassword', () => {
  beforeEach(() => {
    mockedReset.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('client-side guard: shows "match" error when password and confirm differ, without calling the API', async () => {
    renderReset()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-reset-password'), STRONG_PASSWORD)
    await user.type(screen.getByTestId('admin-reset-confirm'), `${STRONG_PASSWORD}-typo`)
    await user.click(screen.getByTestId('admin-reset-submit'))
    expect(screen.getByTestId('admin-reset-error')).toHaveTextContent('Passwords do not match.')
    expect(mockedReset).not.toHaveBeenCalled()
  })

  it('client-side guard: rejects passwords shorter than 12 chars without calling the API', async () => {
    // Server's Zod min(12) would catch this too, but pre-flight the
    // check so the user gets immediate feedback and we don't burn
    // throttle budget on inputs we know will 400.
    renderReset()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-reset-password'), 'short')
    await user.type(screen.getByTestId('admin-reset-confirm'), 'short')
    await user.click(screen.getByTestId('admin-reset-submit'))
    expect(screen.getByTestId('admin-reset-error')).toHaveTextContent('Password must be at least 12 characters.')
    expect(mockedReset).not.toHaveBeenCalled()
  })

  it('shows the invalid-link error if the URL has no token', async () => {
    renderReset('/admin/reset-password')
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-reset-password'), STRONG_PASSWORD)
    await user.type(screen.getByTestId('admin-reset-confirm'), STRONG_PASSWORD)
    await user.click(screen.getByTestId('admin-reset-submit'))
    expect(screen.getByTestId('admin-reset-error')).toHaveTextContent('Reset link is invalid or expired.')
    expect(mockedReset).not.toHaveBeenCalled()
  })

  it('happy path: calls resetPassword(token, password, confirm) and shows the done screen', async () => {
    mockedReset.mockResolvedValueOnce({ message: 'Password updated.' })
    renderReset('/admin/reset-password?token=goodtoken')
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-reset-password'), STRONG_PASSWORD)
    await user.type(screen.getByTestId('admin-reset-confirm'), STRONG_PASSWORD)
    await user.click(screen.getByTestId('admin-reset-submit'))

    await waitFor(() => {
      expect(mockedReset).toHaveBeenCalledWith('goodtoken', STRONG_PASSWORD, STRONG_PASSWORD)
    })
    await waitFor(() => {
      expect(screen.getByTestId('admin-reset-done')).toBeInTheDocument()
    })
    // The form is gone — the user should not be able to re-submit.
    expect(screen.queryByTestId('admin-reset-form')).toBe(null)
  })

  it('weak-password server response: surfaces the dedicated weak-password copy', async () => {
    // The server returns fields.password='weak_password' for zxcvbn
    // rejects (not in the message). The client maps that field code to
    // a longer human-readable hint.
    mockedReset.mockRejectedValueOnce(
      new ApiError({
        kind: 'invalid_input',
        status: 400,
        fields: { password: 'weak_password' },
      }),
    )
    renderReset('/admin/reset-password?token=goodtoken')
    const user = userEvent.setup()
    // Use a 12+ char string so client-side gates pass before the API call.
    const sneakyWeak = 'password1234'
    await user.type(screen.getByTestId('admin-reset-password'), sneakyWeak)
    await user.type(screen.getByTestId('admin-reset-confirm'), sneakyWeak)
    await user.click(screen.getByTestId('admin-reset-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-reset-error')).toHaveTextContent(/Password too weak/)
    })
  })

  it("expired-token server response: surfaces the server's human-readable message verbatim", async () => {
    mockedReset.mockRejectedValueOnce(
      new ApiError({
        kind: 'invalid_input',
        status: 400,
        message: 'This link has expired. Request a new one.',
      }),
    )
    renderReset('/admin/reset-password?token=expiredtoken')
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-reset-password'), STRONG_PASSWORD)
    await user.type(screen.getByTestId('admin-reset-confirm'), STRONG_PASSWORD)
    await user.click(screen.getByTestId('admin-reset-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-reset-error')).toHaveTextContent('This link has expired. Request a new one.')
    })
  })

  it('rate_limited without a server message: falls back to the throttled copy', async () => {
    mockedReset.mockRejectedValueOnce(new ApiError({ kind: 'rate_limited', status: 429 }))
    renderReset('/admin/reset-password?token=goodtoken')
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-reset-password'), STRONG_PASSWORD)
    await user.type(screen.getByTestId('admin-reset-confirm'), STRONG_PASSWORD)
    await user.click(screen.getByTestId('admin-reset-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-reset-error')).toHaveTextContent(/Too many attempts/)
    })
  })
})
