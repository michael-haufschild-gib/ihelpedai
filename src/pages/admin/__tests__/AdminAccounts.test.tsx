import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return {
    ...actual,
    listAdmins: vi.fn(),
    inviteAdmin: vi.fn(),
    deactivateAdmin: vi.fn(),
  }
})

import * as adminApi from '@/lib/adminApi'
import { AdminAccounts } from '@/pages/admin/AdminAccounts'
import { useAdminStore } from '@/stores/adminStore'

const mockedList = vi.mocked(adminApi.listAdmins)
const mockedInvite = vi.mocked(adminApi.inviteAdmin)
const mockedDeactivate = vi.mocked(adminApi.deactivateAdmin)

const SELF_ID = 'selfaaaaaa'
const OTHER_ID = 'otheraaaaa'

function buildAccount(id: string, overrides: Partial<adminApi.AdminAccount> = {}): adminApi.AdminAccount {
  return {
    id,
    email: `${id}@admin.ai`,
    status: 'active',
    createdBy: null,
    lastLoginAt: '2026-04-23T12:00:00.000Z',
    createdAt: '2026-04-22T12:00:00.000Z',
    ...overrides,
  }
}

describe('AdminAccounts', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedInvite.mockReset()
    mockedDeactivate.mockReset()
    useAdminStore.setState({
      admin: { id: SELF_ID, email: `${SELF_ID}@admin.ai` },
      loading: false,
      checked: true,
    })
  })

  afterEach(() => {
    useAdminStore.setState({ admin: null, loading: false, checked: false })
  })

  it('renders the accounts table after the fetch resolves', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildAccount(SELF_ID), buildAccount(OTHER_ID)],
    })
    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-table')).toBeInTheDocument()
    })
    expect(screen.getByTestId(`admin-account-row-${SELF_ID}`)).toBeInTheDocument()
    expect(screen.getByTestId(`admin-account-row-${OTHER_ID}`)).toBeInTheDocument()
  })

  it('does NOT render a Deactivate button on the row of the currently-signed-in admin', async () => {
    // The server's deactivate route 400s if you target your own id. The
    // UI must surface that constraint by hiding the button — otherwise
    // the admin can submit a guaranteed-failing request that consumes
    // throttle budget. Locks the self-guard at the render layer.
    mockedList.mockResolvedValueOnce({
      items: [buildAccount(SELF_ID), buildAccount(OTHER_ID)],
    })
    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-table')).toBeInTheDocument()
    })
    expect(screen.queryByTestId(`admin-account-deactivate-${SELF_ID}`)).toBe(null)
    expect(screen.getByTestId(`admin-account-deactivate-${OTHER_ID}`)).toBeInTheDocument()
  })

  it('does NOT render Deactivate on a row whose status is already deactivated', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildAccount(SELF_ID), buildAccount(OTHER_ID, { status: 'deactivated' })],
    })
    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-table')).toBeInTheDocument()
    })
    expect(screen.queryByTestId(`admin-account-deactivate-${OTHER_ID}`)).toBe(null)
  })

  it('renders the load-error message when listAdmins rejects', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-error')).toHaveTextContent('Failed to load accounts.')
    })
  })

  it('invite happy path: opens modal, posts email, re-fetches, closes modal', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [buildAccount(SELF_ID)] })
      .mockResolvedValueOnce({ items: [buildAccount(SELF_ID), buildAccount(OTHER_ID)] })
    mockedInvite.mockResolvedValueOnce({ status: 'ok', id: OTHER_ID })

    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-accounts-invite'))

    expect(screen.getByTestId('admin-invite-submit')).toBeDisabled()
    await user.type(screen.getByTestId('admin-invite-email'), 'new@admin.ai')
    expect(screen.getByTestId('admin-invite-submit')).not.toBeDisabled()
    await user.click(screen.getByTestId('admin-invite-submit'))

    await waitFor(() => {
      expect(mockedInvite).toHaveBeenCalledWith('new@admin.ai')
    })
    // After invite, modal closes and list re-fetches. The new row appears.
    await waitFor(() => {
      expect(screen.queryByTestId('admin-invite-modal')).toBe(null)
    })
    await waitFor(() => {
      expect(screen.getByTestId(`admin-account-row-${OTHER_ID}`)).toBeInTheDocument()
    })
    expect(mockedList).toHaveBeenCalledTimes(2)
  })

  it('invite error: surfaces the inviteAdmin Error.message inside the modal without closing it', async () => {
    mockedList.mockResolvedValueOnce({ items: [buildAccount(SELF_ID)] })
    mockedInvite.mockRejectedValueOnce(new Error('Email already exists.'))

    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-accounts-invite'))
    await user.type(screen.getByTestId('admin-invite-email'), 'dup@admin.ai')
    await user.click(screen.getByTestId('admin-invite-submit'))

    await waitFor(() => {
      // The error renders inside the modal, NOT in the page-level error.
      // Closing the modal on error would lose the message before the user
      // could read it. Locking it open also keeps the email input populated
      // so a typo can be corrected without re-typing.
      expect(screen.getByTestId('admin-invite-modal')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-invite-modal')).toHaveTextContent('Email already exists.')
    expect(screen.getByTestId('admin-invite-email')).toHaveValue('dup@admin.ai')
  })

  it('deactivate happy path: confirms, fires deactivateAdmin(id), re-fetches', async () => {
    mockedList
      .mockResolvedValueOnce({
        items: [buildAccount(SELF_ID), buildAccount(OTHER_ID)],
      })
      .mockResolvedValueOnce({
        items: [buildAccount(SELF_ID), buildAccount(OTHER_ID, { status: 'deactivated' })],
      })
    mockedDeactivate.mockResolvedValueOnce({ status: 'ok' })

    render(<AdminAccounts />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-accounts-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId(`admin-account-deactivate-${OTHER_ID}`))

    expect(screen.getByTestId('admin-deactivate-modal')).toBeInTheDocument()
    await user.click(screen.getByTestId('admin-deactivate-confirm'))

    await waitFor(() => {
      expect(mockedDeactivate).toHaveBeenCalledWith(OTHER_ID)
    })
    // Modal closes, list re-fetches. The row now reads "deactivated" so
    // the Deactivate button is gone (confirms the conditional render).
    await waitFor(() => {
      expect(screen.queryByTestId('admin-deactivate-modal')).toBe(null)
    })
    await waitFor(() => {
      expect(screen.queryByTestId(`admin-account-deactivate-${OTHER_ID}`)).toBe(null)
    })
  })
})
