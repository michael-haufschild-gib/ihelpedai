import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as adminApi from '@/lib/adminApi'
import { AdminEntries } from '@/pages/admin/AdminEntries'

vi.mock('@/lib/adminApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/adminApi')>('@/lib/adminApi')
  return {
    ...actual,
    listEntries: vi.fn(),
  }
})

const mockedList = vi.mocked(adminApi.listEntries)

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminEntries />
    </MemoryRouter>,
  )
}

function buildPage(
  overrides: Partial<{ items: adminApi.AdminEntry[]; total: number; page: number; page_size: number }> = {},
): adminApi.Paginated<adminApi.AdminEntry> {
  return {
    items: overrides.items ?? [],
    total: overrides.total ?? 0,
    page: overrides.page ?? 1,
    page_size: overrides.page_size ?? 20,
  }
}

function buildEntry(id: string, overrides: Partial<adminApi.AdminEntry> = {}): adminApi.AdminEntry {
  return {
    id,
    entryType: 'post',
    status: 'live',
    source: 'form',
    header: `Header ${id}`,
    bodyPreview: 'preview',
    selfReportedModel: null,
    createdAt: '2026-04-23T12:00:00Z',
    ...overrides,
  }
}

describe('AdminEntries', () => {
  beforeEach(() => {
    mockedList.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads filters from the URL and passes them to listEntries', async () => {
    mockedList.mockResolvedValueOnce(buildPage({ items: [buildEntry('abc123')], total: 1 }))
    renderAt('/admin?entry_type=post&status=pending&q=hello&sort=asc&page=2')
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({
        entry_type: 'post',
        status: 'pending',
        q: 'hello',
        sort: 'asc',
        page: 2,
      })
    })
  })

  it('renders the entries table when the fetch succeeds', async () => {
    mockedList.mockResolvedValueOnce(
      buildPage({
        items: [buildEntry('aaa'), buildEntry('bbb', { entryType: 'report', status: 'deleted' })],
        total: 2,
      }),
    )
    renderAt('/admin')
    await waitFor(() => {
      expect(screen.getByTestId('admin-entries-table')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-entry-row-aaa')).toBeInTheDocument()
    expect(screen.getByTestId('admin-entry-row-bbb')).toBeInTheDocument()
  })

  it('shows the loader on subsequent filter changes (not only the first load)', async () => {
    // First fetch resolves, component settles with data displayed.
    mockedList.mockResolvedValueOnce(buildPage({ items: [buildEntry('a')], total: 1 }))
    renderAt('/admin')
    await waitFor(() => {
      expect(screen.getByTestId('admin-entries-table')).toBeInTheDocument()
    })

    // Regression: before the fix, loading stayed false across filter
    // changes, so the UI held stale data while the next fetch was in
    // flight. A deferred second fetch should surface "Loading..." while
    // pending — we hold it open with an unresolved promise.
    let resolveSecond!: (p: adminApi.Paginated<adminApi.AdminEntry>) => void
    mockedList.mockReturnValueOnce(
      new Promise<adminApi.Paginated<adminApi.AdminEntry>>((res) => { resolveSecond = res }),
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entries-sort-toggle'))

    await waitFor(() => {
      // Loader copy is provisional UI; the test only verifies it becomes
      // visible, not the exact string — scoped to the page.
      expect(screen.getByTestId('admin-entries-page')).toHaveTextContent('Loading...')
    })
    resolveSecond(buildPage({ items: [buildEntry('a2')], total: 1 }))
  })

  it('surfaces a user-facing error when the fetch rejects', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    renderAt('/admin')
    await waitFor(() => {
      expect(screen.getByTestId('admin-entries-error')).toHaveTextContent('Failed to load entries.')
    })
  })

  it('renders the empty-state copy when the list is empty', async () => {
    mockedList.mockResolvedValueOnce(buildPage({ items: [], total: 0 }))
    renderAt('/admin')
    await waitFor(() => {
      expect(screen.getByTestId('admin-entries-empty')).toHaveTextContent('No entries match your filters.')
    })
  })

  it('advances to the next page when the Next button is clicked', async () => {
    // Two pages of data: fetch #1 returns page=1, fetch #2 returns page=2.
    mockedList.mockResolvedValueOnce(buildPage({ items: [buildEntry('p1')], total: 25, page: 1 }))
    renderAt('/admin')
    await waitFor(() => {
      expect(screen.getByTestId('admin-entries-next')).toBeInTheDocument()
    })

    mockedList.mockResolvedValueOnce(buildPage({ items: [buildEntry('p2')], total: 25, page: 2 }))
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entries-next'))

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    })
  })
})
