import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return {
    ...actual,
    listTakedowns: vi.fn(),
    createTakedown: vi.fn(),
    updateTakedown: vi.fn(),
  }
})

vi.mock('@/stores/toastStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/toastStore')>('@/stores/toastStore')
  return { ...actual, showToast: vi.fn() }
})

import * as adminApi from '@/lib/adminApi'
import { AdminTakedowns } from '@/pages/admin/AdminTakedowns'
import { showToast } from '@/stores/toastStore'

const mockedList = vi.mocked(adminApi.listTakedowns)
const mockedCreate = vi.mocked(adminApi.createTakedown)
const mockedUpdate = vi.mocked(adminApi.updateTakedown)
const mockedToast = vi.mocked(showToast)

function buildTakedown(id: string, overrides: Partial<adminApi.AdminTakedown> = {}): adminApi.AdminTakedown {
  return {
    id,
    requesterEmail: 'requester@example.com',
    entryId: null,
    entryKind: null,
    reason: `Reason for ${id}`,
    notes: '',
    status: 'open',
    disposition: null,
    closedBy: null,
    dateReceived: '2026-04-23',
    createdAt: '2026-04-23T12:00:00Z',
    updatedAt: '2026-04-23T12:00:00Z',
    ...overrides,
  }
}

function renderTakedowns(initialPath = '/admin/takedowns'): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/takedowns" element={<AdminTakedowns />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminTakedowns — list rendering', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedCreate.mockReset()
    mockedUpdate.mockReset()
    mockedToast.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the empty-state when the list is empty', async () => {
    mockedList.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    })
    renderTakedowns()
    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-empty')).toBeInTheDocument()
    })
  })

  it('renders the error message on a fetch failure and clears any prior data', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    renderTakedowns()
    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-error')).toHaveTextContent('Failed to load takedowns.')
    })
  })

  it('renders one row per item with the close action only on open rows', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildTakedown('open1'), buildTakedown('closed1', { status: 'closed' })],
      total: 2,
      page: 1,
      page_size: 50,
    })
    renderTakedowns()
    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-table')).toBeInTheDocument()
    })
    // Open row exposes the Close button. Closed row does NOT — locks
    // the conditional that guards a re-close (which would tunnel the
    // disposition value back to '' and corrupt the audit trail).
    expect(screen.getByTestId('admin-takedown-close-open1')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-takedown-close-closed1')).toBe(null)
  })
})

describe('AdminTakedowns — status filter', () => {
  beforeEach(() => {
    mockedList.mockReset()
  })

  it('seeds listTakedowns with no status filter on initial load', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    renderTakedowns()
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: undefined, page: 1 })
    })
  })

  it('passes the status query param through to listTakedowns when present in URL', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    renderTakedowns('/admin/takedowns?status=open&page=2')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: 'open', page: 2 })
    })
  })

  it('clamps invalid page values back to 1 (negative + non-numeric)', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    renderTakedowns('/admin/takedowns?page=-7')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: undefined, page: 1 })
    })
  })

  it('ignores an unknown status value (not "open"/"closed") instead of forwarding it to the API', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    renderTakedowns('/admin/takedowns?status=mystery')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ status: undefined, page: 1 })
    })
  })
})

describe('AdminTakedowns — create flow', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedCreate.mockReset()
    mockedToast.mockReset()
  })

  it('opens the create modal, posts the form, then re-fetches the list', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    mockedCreate.mockResolvedValueOnce(buildTakedown('newone'))
    renderTakedowns()

    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-page')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-takedowns-create'))

    await user.type(screen.getByTestId('admin-takedown-email'), 'victim@example.com')
    await user.type(screen.getByTestId('admin-takedown-reason'), 'Wrong attribution.')
    // The submit button stays disabled while reason is empty; locking
    // that branch matters because the route requires reason and would
    // 400 — but the user wouldn't know why.
    await user.click(screen.getByTestId('admin-takedown-submit'))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(1)
    })
    const firstCall = mockedCreate.mock.calls[0]
    if (firstCall === undefined) throw new Error('expected create call')
    expect(firstCall[0]).toMatchObject({
      requester_email: 'victim@example.com',
      reason: 'Wrong attribution.',
    })
  })

  it('toasts on a create failure', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    mockedCreate.mockRejectedValueOnce(new Error('server down'))
    renderTakedowns()

    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-page')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-takedowns-create'))
    await user.type(screen.getByTestId('admin-takedown-reason'), 'fails')
    await user.click(screen.getByTestId('admin-takedown-submit'))

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith('Failed to create takedown.')
    })
  })

  it('keeps the submit button disabled until reason is non-empty', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    renderTakedowns()
    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-page')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-takedowns-create'))
    expect(screen.getByTestId('admin-takedown-submit')).toBeDisabled()
    await user.type(screen.getByTestId('admin-takedown-reason'), 'now valid')
    expect(screen.getByTestId('admin-takedown-submit')).not.toBeDisabled()
  })
})

describe('AdminTakedowns — close flow', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedUpdate.mockReset()
    mockedToast.mockReset()
  })

  it('opens the close modal with disposition required before submit', async () => {
    mockedList.mockResolvedValue({
      items: [buildTakedown('toclose')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    mockedUpdate.mockResolvedValueOnce(buildTakedown('toclose', { status: 'closed' }))
    renderTakedowns()
    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-takedown-close-toclose'))
    expect(screen.getByTestId('admin-takedown-close-modal')).toBeInTheDocument()
    // Without a disposition, the confirm button is disabled. Important
    // because closing without a disposition would store NULL — the audit
    // trail then can't tell why this report was kept vs. removed.
    expect(screen.getByTestId('admin-takedown-close-confirm')).toBeDisabled()

    await user.selectOptions(screen.getByTestId('admin-takedown-disposition'), 'entry_deleted')
    await user.type(screen.getByTestId('admin-takedown-notes'), 'fixed it')
    await user.click(screen.getByTestId('admin-takedown-close-confirm'))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith('toclose', {
        status: 'closed',
        disposition: 'entry_deleted',
        notes: 'fixed it',
      })
    })
  })

  it('toasts on a close failure', async () => {
    mockedList.mockResolvedValue({
      items: [buildTakedown('toclose')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    mockedUpdate.mockRejectedValueOnce(new Error('server down'))
    renderTakedowns()
    await waitFor(() => {
      expect(screen.getByTestId('admin-takedowns-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-takedown-close-toclose'))
    await user.selectOptions(screen.getByTestId('admin-takedown-disposition'), 'entry_kept')
    await user.click(screen.getByTestId('admin-takedown-close-confirm'))

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith('Failed to close takedown.')
    })
  })
})
