import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return {
    ...actual,
    listApiKeys: vi.fn(),
    revokeApiKey: vi.fn(),
  }
})

vi.mock('@/stores/toastStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/toastStore')>('@/stores/toastStore')
  return { ...actual, showToast: vi.fn() }
})

import * as adminApi from '@/lib/adminApi'
import { AdminApiKeys } from '@/pages/admin/AdminApiKeys'
import { showToast } from '@/stores/toastStore'

const mockedList = vi.mocked(adminApi.listApiKeys)
const mockedRevoke = vi.mocked(adminApi.revokeApiKey)
const mockedToast = vi.mocked(showToast)

function buildKey(id: string, overrides: Partial<adminApi.AdminApiKey> = {}): adminApi.AdminApiKey {
  // The public AdminApiKey type omits keyHash — only the server-side
  // record carries the verifier hash. listApiKeys/getApiKey strip it
  // before responding, and the type system enforces the omission here.
  return {
    id,
    keyLast4: id.slice(-4),
    emailHash: `email-${id}`,
    status: 'active',
    issuedAt: '2026-04-22T10:00:00.000Z',
    lastUsedAt: '2026-04-23T10:00:00.000Z',
    usageCount: 12,
    ...overrides,
  }
}

function renderApiKeys(initialPath = '/admin/api-keys'): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/api-keys" element={<AdminApiKeys />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminApiKeys — render branches', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedRevoke.mockReset()
    mockedToast.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the empty-state when the list is empty', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50 })
    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-empty')).toBeInTheDocument()
    })
  })

  it('renders the load error', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-error')).toHaveTextContent('Failed to load API keys.')
    })
  })

  it('renders one row per key, showing Revoke only on active rows', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildKey('aaaaaa1234'), buildKey('bbbbbb5678', { status: 'revoked' })],
      total: 2,
      page: 1,
      page_size: 50,
    })
    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-table')).toBeInTheDocument()
    })
    // Active key — Revoke button visible. Locks the conditional that
    // prevents double-revoking an already-revoked key (which would be a
    // server-side 200 no-op but should never reach the API).
    expect(screen.getByTestId('admin-apikey-revoke-aaaaaa1234')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-apikey-revoke-bbbbbb5678')).toBe(null)
  })
})

describe('AdminApiKeys — status filter from URL', () => {
  beforeEach(() => {
    mockedList.mockReset()
  })

  it('uses status=active from the URL', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50 })
    renderApiKeys('/admin/api-keys?status=active')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: 'active', page: 1 })
    })
  })

  it('treats an unknown status value as no filter', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50 })
    renderApiKeys('/admin/api-keys?status=quasi-active')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: undefined, page: 1 })
    })
  })

  it('clamps a negative page back to 1', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50 })
    renderApiKeys('/admin/api-keys?page=-3')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: undefined, page: 1 })
    })
  })
})

describe('AdminApiKeys — revoke confirmation guard', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedRevoke.mockReset()
    mockedToast.mockReset()
  })

  it('confirm button stays disabled until "REVOKE" is typed exactly', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildKey('aaaaaa1234')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-apikey-revoke-aaaaaa1234'))
    expect(screen.getByTestId('admin-revoke-modal')).toBeInTheDocument()
    expect(screen.getByTestId('admin-revoke-confirm')).toBeDisabled()

    // Lowercase variant — guard must reject (server is case-sensitive too).
    await user.type(screen.getByTestId('admin-revoke-confirmation'), 'revoke')
    expect(screen.getByTestId('admin-revoke-confirm')).toBeDisabled()

    await user.clear(screen.getByTestId('admin-revoke-confirmation'))
    await user.type(screen.getByTestId('admin-revoke-confirmation'), 'REVOKE')
    expect(screen.getByTestId('admin-revoke-confirm')).not.toBeDisabled()
  })

  it('confirm fires revokeApiKey(id, reason) only after exact match + click', async () => {
    mockedList
      .mockResolvedValueOnce({
        items: [buildKey('aaaaaa1234')],
        total: 1,
        page: 1,
        page_size: 50,
      })
      .mockResolvedValueOnce({
        items: [buildKey('aaaaaa1234', { status: 'revoked' })],
        total: 1,
        page: 1,
        page_size: 50,
      })
    mockedRevoke.mockResolvedValueOnce({ status: 'ok' })

    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-apikey-revoke-aaaaaa1234'))
    await user.type(screen.getByTestId('admin-revoke-confirmation'), 'REVOKE')
    await user.type(screen.getByTestId('admin-revoke-reason'), 'compromised')
    await user.click(screen.getByTestId('admin-revoke-confirm'))

    await waitFor(() => {
      expect(mockedRevoke).toHaveBeenCalledWith('aaaaaa1234', 'compromised')
    })
    // Modal closes; list re-fetches; revoke button is now hidden because
    // the row's status is 'revoked'.
    await waitFor(() => {
      expect(screen.queryByTestId('admin-revoke-modal')).toBe(null)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('admin-apikey-revoke-aaaaaa1234')).toBe(null)
    })
  })

  it('toasts on a revoke failure without closing the modal', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildKey('aaaaaa1234')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    mockedRevoke.mockRejectedValueOnce(new Error('500'))
    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-apikey-revoke-aaaaaa1234'))
    await user.type(screen.getByTestId('admin-revoke-confirmation'), 'REVOKE')
    await user.click(screen.getByTestId('admin-revoke-confirm'))

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith('Failed to revoke key.')
    })
    // Modal must remain open after a revoke failure so the operator can
    // retry or cancel — silently dismissing it would mask the failure.
    expect(screen.getByTestId('admin-revoke-modal')).toBeInTheDocument()
  })

  it('cancel resets the typed confirmation + reason so a re-open starts fresh', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildKey('aaaaaa1234'), buildKey('bbbbbb5678')],
      total: 2,
      page: 1,
      page_size: 50,
    })
    renderApiKeys()
    await waitFor(() => {
      expect(screen.getByTestId('admin-apikeys-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-apikey-revoke-aaaaaa1234'))
    await user.type(screen.getByTestId('admin-revoke-confirmation'), 'partial')
    // Populate the reason too so the post-cancel empty-value assertion
    // actually catches a regression where reason state survives a cancel.
    await user.type(screen.getByTestId('admin-revoke-reason'), 'compromised')
    await user.click(screen.getByTestId('admin-revoke-cancel'))

    // Re-open on a different key. The confirmation and reason fields
    // must be empty — otherwise a half-typed string from one key could
    // arm the confirm button on a different key, which is exactly the
    // wrong-key revoke risk this guard exists to prevent.
    await user.click(screen.getByTestId('admin-apikey-revoke-bbbbbb5678'))
    expect(screen.getByTestId('admin-revoke-confirmation')).toHaveValue('')
    expect(screen.getByTestId('admin-revoke-reason')).toHaveValue('')
  })
})
