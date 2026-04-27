import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return {
    ...actual,
    listQueue: vi.fn(),
    queueAction: vi.fn(),
    bulkQueueAction: vi.fn(),
  }
})

vi.mock('@/stores/toastStore', async () => {
  const actual = await vi.importActual<typeof import('@/stores/toastStore')>('@/stores/toastStore')
  return { ...actual, showToast: vi.fn() }
})

import * as adminApi from '@/lib/adminApi'
import { ApiError } from '@/lib/api'
import { AdminQueue } from '@/pages/admin/AdminQueue'
import { showToast } from '@/stores/toastStore'

const mockedList = vi.mocked(adminApi.listQueue)
const mockedAction = vi.mocked(adminApi.queueAction)
const mockedBulk = vi.mocked(adminApi.bulkQueueAction)
const mockedToast = vi.mocked(showToast)

function buildEntry(id: string, overrides: Partial<adminApi.AdminEntry> = {}): adminApi.AdminEntry {
  return {
    id,
    entryType: 'report',
    status: 'pending',
    source: 'api',
    header: `Header ${id}`,
    bodyPreview: `Body preview for ${id}`,
    selfReportedModel: 'queue-bot',
    createdAt: '2026-04-23T12:00:00Z',
    ...overrides,
  }
}

function renderQueue(): void {
  render(
    <MemoryRouter initialEntries={['/admin/queue']}>
      <Routes>
        <Route path="/admin/queue" element={<AdminQueue />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminQueue — render branches', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedAction.mockReset()
    mockedBulk.mockReset()
    mockedToast.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the empty-state when queue.items is empty', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50 })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('admin-queue-table')).toBe(null)
  })

  it('surfaces a load error when the list fetch rejects', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-error')).toHaveTextContent('Failed to load queue.')
    })
  })

  it('renders one row per entry plus the count + table testids', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildEntry('aaa'), buildEntry('bbb')],
      total: 2,
      page: 1,
      page_size: 50,
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-table')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-queue-count')).toHaveTextContent('2 pending')
    expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    expect(screen.getByTestId('admin-queue-row-bbb')).toBeInTheDocument()
  })
})

describe('AdminQueue — single-row action flow', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedAction.mockReset()
    mockedBulk.mockReset()
    mockedToast.mockReset()
  })

  it('approve flow: prompt button → confirm button → calls queueAction(id, "approve")', async () => {
    mockedList.mockResolvedValue({ items: [buildEntry('aaa')], total: 1, page: 1, page_size: 50 })
    mockedAction.mockResolvedValueOnce({
      status: 'ok',
      entry_id: 'aaa',
      action: 'approve',
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    // First click selects the action mode (renders confirm + reason input).
    await user.click(screen.getByTestId('admin-queue-approve-aaa'))
    expect(screen.getByTestId('admin-queue-confirm-aaa')).toBeInTheDocument()
    expect(screen.getByTestId('admin-queue-reason-aaa')).toBeInTheDocument()

    await user.type(screen.getByTestId('admin-queue-reason-aaa'), 'looks fine')
    await user.click(screen.getByTestId('admin-queue-confirm-aaa'))

    await waitFor(() => {
      expect(mockedAction).toHaveBeenCalledWith('aaa', 'approve', 'looks fine')
    })
  })

  it('reject flow: surfaces a toast on rate_limited error', async () => {
    mockedList.mockResolvedValue({ items: [buildEntry('aaa')], total: 1, page: 1, page_size: 50 })
    mockedAction.mockRejectedValueOnce(new ApiError({ kind: 'rate_limited', status: 429, retryAfterSeconds: 30 }))
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-queue-reject-aaa'))
    await user.click(screen.getByTestId('admin-queue-confirm-aaa'))

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith('Too many actions. Wait a moment, then retry.')
    })
  })

  it('confirm reason text submits via Enter key (without clicking the confirm button)', async () => {
    // Lock the keyboard shortcut: Enter inside the reason input triggers
    // the action. This shaves a click off the moderator's loop and is
    // surprisingly easy to break with a re-render of the input wrapper.
    mockedList.mockResolvedValue({ items: [buildEntry('aaa')], total: 1, page: 1, page_size: 50 })
    mockedAction.mockResolvedValueOnce({ status: 'ok', entry_id: 'aaa', action: 'approve' })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-queue-approve-aaa'))
    const reason = screen.getByTestId('admin-queue-reason-aaa')
    await user.type(reason, 'enter to confirm{Enter}')

    await waitFor(() => {
      expect(mockedAction).toHaveBeenCalledWith('aaa', 'approve', 'enter to confirm')
    })
  })
})

describe('AdminQueue — bulk select + bulk action flow', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedAction.mockReset()
    mockedBulk.mockReset()
    mockedToast.mockReset()
  })

  it('selecting two rows enables the bulk-approve button with the right count', async () => {
    mockedList.mockResolvedValue({
      items: [buildEntry('aaa'), buildEntry('bbb'), buildEntry('ccc')],
      total: 3,
      page: 1,
      page_size: 50,
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()

    // No selection — bulk buttons hidden.
    expect(screen.queryByTestId('admin-queue-bulk-approve')).toBe(null)

    await user.click(screen.getByTestId('admin-queue-select-aaa'))
    await user.click(screen.getByTestId('admin-queue-select-bbb'))

    const bulkApprove = screen.getByTestId('admin-queue-bulk-approve')
    expect(bulkApprove).toHaveTextContent('Approve 2 selected')
    const bulkReject = screen.getByTestId('admin-queue-bulk-reject')
    expect(bulkReject).toHaveTextContent('Reject 2 selected')
  })

  it('select-all toggle picks every visible row, second click clears them', async () => {
    mockedList.mockResolvedValue({
      items: [buildEntry('aaa'), buildEntry('bbb'), buildEntry('ccc')],
      total: 3,
      page: 1,
      page_size: 50,
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-queue-select-all'))
    expect(screen.getByTestId('admin-queue-bulk-approve')).toHaveTextContent('Approve 3 selected')

    await user.click(screen.getByTestId('admin-queue-select-all'))
    expect(screen.queryByTestId('admin-queue-bulk-approve')).toBe(null)
  })

  it('bulk-approve fires bulkQueueAction with every selected id', async () => {
    mockedList.mockResolvedValue({
      items: [buildEntry('aaa'), buildEntry('bbb'), buildEntry('ccc')],
      total: 3,
      page: 1,
      page_size: 50,
    })
    mockedBulk.mockResolvedValueOnce({
      status: 'ok',
      results: [
        { id: 'aaa', ok: true },
        { id: 'bbb', ok: true },
      ],
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-queue-select-aaa'))
    await user.click(screen.getByTestId('admin-queue-select-bbb'))
    await user.click(screen.getByTestId('admin-queue-bulk-approve'))

    await waitFor(() => {
      expect(mockedBulk).toHaveBeenCalledTimes(1)
    })
    const firstCall = mockedBulk.mock.calls[0]
    if (firstCall === undefined) throw new Error('expected bulk call')
    const [ids, action] = firstCall
    // Set iteration order is insertion order in modern JS engines, so we
    // rely on it here. If a future refactor switches to Map/sortable
    // collection, this assertion will need to relax to `expect.arrayContaining`.
    expect(ids).toEqual(['aaa', 'bbb'])
    expect(action).toBe('approve')
  })

  it('bulk-action surfaces a toast on session-expired (401) failure', async () => {
    mockedList.mockResolvedValue({
      items: [buildEntry('aaa')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    mockedBulk.mockRejectedValueOnce(new ApiError({ kind: 'unauthorized', status: 401, message: '' }))
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-queue-select-aaa'))
    await user.click(screen.getByTestId('admin-queue-bulk-reject'))
    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith('Session expired. Sign in again to continue.')
    })
  })
})

describe('AdminQueue — keyboard shortcut entry mode', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedAction.mockReset()
    mockedBulk.mockReset()
  })

  it('pressing "a" on a focused row enters approve mode (no Cmd/Ctrl modifier)', async () => {
    mockedList.mockResolvedValue({ items: [buildEntry('aaa')], total: 1, page: 1, page_size: 50 })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    const row = screen.getByTestId('admin-queue-row-aaa')
    row.focus()
    await user.keyboard('a')
    // Approve mode shows the confirm button; locking that cycle in
    // matters because a refactor that broadened the modifier guard
    // (e.g. to also trigger on Ctrl+A) would silently break browser
    // shortcuts.
    expect(screen.getByTestId('admin-queue-confirm-aaa')).toBeInTheDocument()
  })

  it('Cmd/Ctrl+A on a row does NOT enter approve mode (browser shortcut preserved)', async () => {
    mockedList.mockResolvedValue({ items: [buildEntry('aaa')], total: 1, page: 1, page_size: 50 })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    const row = screen.getByTestId('admin-queue-row-aaa')
    row.focus()
    await user.keyboard('{Control>}a{/Control}')
    expect(screen.queryByTestId('admin-queue-confirm-aaa')).toBe(null)
  })
})

describe('AdminQueue — pagination', () => {
  beforeEach(() => {
    mockedList.mockReset()
  })

  it('renders Prev/Next buttons only when totalPages > 1', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildEntry('aaa')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-table')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('admin-queue-prev')).toBe(null)
    expect(screen.queryByTestId('admin-queue-next')).toBe(null)
  })

  it('Next button advances the page query param (re-fetch verified through second listQueue call)', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildEntry('p1')],
      total: 75,
      page: 1,
      page_size: 50,
    })
    mockedList.mockResolvedValueOnce({
      items: [buildEntry('p2')],
      total: 75,
      page: 2,
      page_size: 50,
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-table')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-queue-next'))
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith(2)
    })
  })

  it('row link points at /admin/entries/<id>', async () => {
    mockedList.mockResolvedValueOnce({
      items: [buildEntry('aaa')],
      total: 1,
      page: 1,
      page_size: 50,
    })
    renderQueue()
    await waitFor(() => {
      expect(screen.getByTestId('admin-queue-row-aaa')).toBeInTheDocument()
    })
    const link = within(screen.getByTestId('admin-queue-row-aaa')).getByTestId('admin-queue-link-aaa')
    expect(link).toHaveAttribute('href', '/admin/entries/aaa')
  })
})
