import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useHomeFeed } from '@/features/home/useHomeFeed'

vi.mock('@/lib/api', () => ({
  listHelpedPosts: vi.fn(),
  listReports: vi.fn(),
  listRecentAgentReports: vi.fn(),
}))

// Importing AFTER vi.mock so the mocked functions are bound. Cast through
// `unknown` because vitest's `vi.mocked` requires the actual module type.
import { listHelpedPosts, listRecentAgentReports, listReports } from '@/lib/api'

const mockedListHelpedPosts = vi.mocked(listHelpedPosts)
const mockedListReports = vi.mocked(listReports)
const mockedListRecentAgentReports = vi.mocked(listRecentAgentReports)

/**
 * Pins the contract that a single sub-fetch failure is surfaced via the
 * `partial` flag and renders that total as `null` (→ "—") rather than zero.
 * Older versions defaulted to 0 on failure, displaying an authoritative
 * "0 reports" when the reports endpoint was simply down.
 */
describe('useHomeFeed — partial-failure surfacing', () => {
  it('reports all totals when every endpoint succeeds', async () => {
    mockedListHelpedPosts.mockResolvedValue({ items: [], total: 7, page: 1, page_size: 20 })
    mockedListReports.mockResolvedValue({ items: [], total: 4, page: 1, page_size: 20 })
    mockedListRecentAgentReports.mockResolvedValue({ items: [], total: 2, page: 1, page_size: 20 })

    const { result } = renderHook(() => useHomeFeed())
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.totals).toEqual({ posts: 7, reports: 4, agents: 2 })
    expect(result.current.partial).toEqual({ posts: false, reports: false, agents: false })
  })

  it('marks reports as null when only listReports fails', async () => {
    mockedListHelpedPosts.mockResolvedValue({ items: [], total: 7, page: 1, page_size: 20 })
    mockedListReports.mockRejectedValue(new Error('reports endpoint down'))
    mockedListRecentAgentReports.mockResolvedValue({ items: [], total: 2, page: 1, page_size: 20 })

    const { result } = renderHook(() => useHomeFeed())
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.totals.reports).toBe(null)
    expect(result.current.totals.posts).toBe(7)
    expect(result.current.totals.agents).toBe(2)
    expect(result.current.partial).toEqual({ posts: false, reports: true, agents: false })
  })

  it('marks every total as null when every endpoint fails', async () => {
    mockedListHelpedPosts.mockRejectedValue(new Error('boom'))
    mockedListReports.mockRejectedValue(new Error('boom'))
    mockedListRecentAgentReports.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useHomeFeed())
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.totals).toEqual({ posts: null, reports: null, agents: null })
    expect(result.current.partial).toEqual({ posts: true, reports: true, agents: true })
    expect(result.current.posts).toEqual([])
  })
})
