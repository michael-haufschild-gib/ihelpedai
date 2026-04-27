import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return { ...actual, listAuditLog: vi.fn() }
})

import * as adminApi from '@/lib/adminApi'
import { AdminAuditLog } from '@/pages/admin/AdminAuditLog'

const mockedList = vi.mocked(adminApi.listAuditLog)

function buildEntry(id: string, overrides: Partial<adminApi.AuditEntry> = {}): adminApi.AuditEntry {
  return {
    id,
    adminId: 'opsadminid',
    adminEmail: 'ops@admin.ai',
    action: 'delete',
    targetId: `target-${id}`,
    targetKind: 'post',
    details: null,
    createdAt: '2026-04-23T12:00:00.000Z',
    ...overrides,
  }
}

function renderAudit(initialPath = '/admin/audit'): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/audit" element={<AdminAuditLog />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminAuditLog', () => {
  beforeEach(() => {
    mockedList.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reads action + date filters from URL and forwards them', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 100 })
    renderAudit('/admin/audit?action=delete&date_from=2026-01-01&date_to=2026-12-31&page=2')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({
        action: 'delete',
        date_from: '2026-01-01',
        date_to: '2026-12-31',
        page: 2,
      })
    })
  })

  it('treats empty filters as no filter (UI-clear semantics)', async () => {
    // The page's filter bar produces an empty string when the user
    // clears a date — the page must transform empty to undefined so
    // the API receives "no filter" instead of "match nothing". The
    // server has the same guard (admin-audit-filters.spec locks it),
    // but the client-side transform matters too.
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 100 })
    renderAudit('/admin/audit?action=&date_from=&date_to=')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({
        action: undefined,
        date_from: undefined,
        date_to: undefined,
        page: 1,
      })
    })
  })

  it('renders the empty-state when the list is empty', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 100 })
    renderAudit()
    await waitFor(() => {
      expect(screen.getByTestId('admin-audit-empty')).toBeInTheDocument()
    })
  })

  it('renders the load error', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    renderAudit()
    await waitFor(() => {
      expect(screen.getByTestId('admin-audit-error')).toHaveTextContent('Failed to load audit log.')
    })
  })

  it('renders one row per audit entry with admin email + action', async () => {
    mockedList.mockResolvedValueOnce({
      items: [
        buildEntry('au1', { action: 'delete', adminEmail: 'ops@admin.ai' }),
        buildEntry('au2', { action: 'restore', adminEmail: null }),
      ],
      total: 2,
      page: 1,
      page_size: 100,
    })
    renderAudit()
    await waitFor(() => {
      expect(screen.getByTestId('admin-audit-table')).toBeInTheDocument()
    })
    const row1 = screen.getByTestId('admin-audit-row-au1')
    expect(row1).toHaveTextContent('ops@admin.ai')
    expect(row1).toHaveTextContent('delete')
    // adminEmail null falls back to "system" — locks that we surface a
    // sensible label for system-emitted audit rows (e.g. cleanup tasks).
    const row2 = screen.getByTestId('admin-audit-row-au2')
    expect(row2).toHaveTextContent('system')
    expect(row2).toHaveTextContent('restore')
  })

  it('changing the action filter sets the URL and re-fetches with the new filter', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 100 }).mockResolvedValueOnce({
      items: [buildEntry('au-purge', { action: 'purge' })],
      total: 1,
      page: 1,
      page_size: 100,
    })
    renderAudit()
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(1)
    })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByTestId('admin-audit-action-filter'), 'purge')
    // The URL update fires another fetch with action='purge'.
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'purge', page: 1 }))
    })
  })
})
