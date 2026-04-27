import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock is hoisted to the very top of the module, so any binding it
// references must also be hoisted. Defining both `mockNavigate` and the
// `navigateShim` it returns inside vi.hoisted keeps the eslint-react
// hook-factories rule happy (hooks at module scope are fine; hooks
// defined inside another function are flagged) AND ensures the shim is
// initialized before vi.mock evaluates.
const { mockNavigate, navigateShim } = vi.hoisted(() => {
  const navigate = vi.fn()
  return {
    mockNavigate: navigate,
    navigateShim: (): typeof navigate => navigate,
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: navigateShim }
})

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return { ...actual, login: vi.fn() }
})

import { ApiError } from '@/lib/api'
import * as adminApi from '@/lib/adminApi'
import { AdminLogin } from '@/pages/admin/AdminLogin'
import { useAdminStore } from '@/stores/adminStore'

const mockedLogin = vi.mocked(adminApi.login)

function renderLogin(): void {
  render(
    <MemoryRouter initialEntries={['/admin/login']}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminLogin', () => {
  beforeEach(() => {
    mockedLogin.mockReset()
    mockNavigate.mockReset()
    useAdminStore.setState({ admin: null, loading: false, checked: false })
  })

  afterEach(() => {
    useAdminStore.setState({ admin: null, loading: false, checked: false })
  })

  it('happy path: submit calls login(), populates the store, and navigates to /admin', async () => {
    mockedLogin.mockResolvedValueOnce({
      status: 'ok',
      admin: { id: 'aaaaaaaaaa', email: 'ops@admin.ai', status: 'active' },
    })
    renderLogin()
    const user = userEvent.setup()

    await user.type(screen.getByTestId('admin-login-email'), 'ops@admin.ai')
    await user.type(screen.getByTestId('admin-login-password'), 'testpassword12')
    await user.click(screen.getByTestId('admin-login-submit'))

    // The login fetch is awaited, then the store is populated, then
    // navigate('/admin', {replace:true}) fires. Locks the full handler
    // sequence in one go.
    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith('ops@admin.ai', 'testpassword12')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
    })
    expect(useAdminStore.getState().admin).toEqual({
      id: 'aaaaaaaaaa',
      email: 'ops@admin.ai',
      // The login response now includes `status` so the AdminUser
      // shape is identical to what /me returns; the store carries it
      // through unchanged.
      status: 'active',
    })
  })

  it('rate-limited error surfaces the rate-limit copy and clears the password field', async () => {
    // ApiError.kind='rate_limited' — the page must show the server's
    // (or fallback) message AND clear the password input so the user
    // doesn't accidentally re-submit on Enter.
    mockedLogin.mockRejectedValueOnce(
      new ApiError({
        kind: 'rate_limited',
        status: 429,
        retryAfterSeconds: 60,
        message: 'Too many attempts. Try again in 1 minutes.',
      }),
    )
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-login-email'), 'ops@admin.ai')
    await user.type(screen.getByTestId('admin-login-password'), 'testpassword12')
    await user.click(screen.getByTestId('admin-login-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-login-error')).toHaveTextContent('Too many attempts. Try again in 1 minutes.')
    })
    // Password input is cleared after a failed submission. Without this,
    // a user retrying via Enter on the form would re-submit the same
    // password and burn rate-limit budget on every attempt.
    expect(screen.getByTestId('admin-login-password')).toHaveValue('')
    // navigate must not have fired on the failure branch.
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useAdminStore.getState().admin).toBe(null)
  })

  it('401 unauthorized surfaces the generic incorrect-credentials copy', async () => {
    // Explicitly NOT echoing the server's message on 401 — the route
    // emits "Email or password is incorrect.", which is what we display.
    // Locks the deliberate generic-message choice that defends timing
    // and existence oracles.
    mockedLogin.mockRejectedValueOnce(
      new ApiError({ kind: 'unauthorized', status: 401, message: 'Email or password is incorrect.' }),
    )
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-login-email'), 'ops@admin.ai')
    await user.type(screen.getByTestId('admin-login-password'), 'whatever12345')
    await user.click(screen.getByTestId('admin-login-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-login-error')).toHaveTextContent('Email or password is incorrect.')
    })
    expect(screen.getByTestId('admin-login-password')).toHaveValue('')
  })

  it('disables the submit button while a request is in flight', async () => {
    // A slow login should set the button text to "Logging in..." and
    // disable it. Without this, a fast double-click would issue two
    // identical login requests, each consuming throttle budget.
    let resolveLogin!: () => void
    mockedLogin.mockImplementationOnce(
      () =>
        new Promise<adminApi.LoginResponse>((res) => {
          resolveLogin = () =>
            res({ status: 'ok', admin: { id: 'aaaaaaaaaa', email: 'ops@admin.ai', status: 'active' } })
        }),
    )
    renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('admin-login-email'), 'ops@admin.ai')
    await user.type(screen.getByTestId('admin-login-password'), 'testpassword12')
    await user.click(screen.getByTestId('admin-login-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-login-submit')).toBeDisabled()
    })
    expect(screen.getByTestId('admin-login-submit')).toHaveTextContent('Logging in...')

    resolveLogin()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
    })
  })

  it('exposes a forgot-password link to /admin/forgot-password', async () => {
    renderLogin()
    const link = screen.getByTestId('admin-forgot-password-link')
    expect(link).toHaveAttribute('href', '/admin/forgot-password')
  })
})
