import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNavigate, navigateShim } = vi.hoisted(() => {
  const navigate = vi.fn()
  // Shim wraps the spy at module scope (not inside a hook factory) so
  // eslint-react's hook-factories rule stays happy. The vi.mock factory
  // below imports it transparently as `useNavigate`.
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
  return {
    ...actual,
    getEntry: vi.fn(),
    entryAction: vi.fn(),
    purgeEntry: vi.fn(),
  }
})

import * as adminApi from '@/lib/adminApi'
import { ApiError } from '@/lib/api'
import { AdminEntryDetail } from '@/pages/admin/AdminEntryDetail'

const mockedGet = vi.mocked(adminApi.getEntry)
const mockedAction = vi.mocked(adminApi.entryAction)
const mockedPurge = vi.mocked(adminApi.purgeEntry)

function buildEntry(overrides: Partial<adminApi.AdminEntryDetail> = {}): adminApi.AdminEntryDetail {
  return {
    id: 'aBcDeFgHiJ',
    entryType: 'post',
    status: 'live',
    source: 'form',
    fields: { first_name: 'Sam', city: 'Austin', country: 'US', text: 'helped out' },
    clientIpHash: 'abc123hashvalue',
    selfReportedModel: null,
    createdAt: '2026-04-23T12:00:00.000Z',
    audit_log: [],
    ...overrides,
  }
}

function renderDetail(): void {
  render(
    <MemoryRouter initialEntries={['/admin/entries/aBcDeFgHiJ']}>
      <Routes>
        <Route path="/admin/entries/:id" element={<AdminEntryDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminEntryDetail — fetch + render branches', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedAction.mockReset()
    mockedPurge.mockReset()
    mockNavigate.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the detail card after a successful fetch', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry())
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    // Fields render as JSON — the lock matters because the production
    // surface deliberately renders the raw fields blob as a code block
    // rather than mapping fields by label. A regression that swapped to
    // <Form> rendering would break this and need explicit re-design.
    const fields = screen.getByTestId('admin-entry-fields')
    expect(fields).toHaveTextContent('"first_name": "Sam"')
    expect(fields).toHaveTextContent('"city": "Austin"')
  })

  it('renders the not-found marker when getEntry returns 404', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError({ kind: 'not_found', status: 404, message: 'not_found' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-not-found')).toBeInTheDocument()
    })
  })

  it('renders a generic load-failure error on other API error kinds', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError({ kind: 'invalid_input', status: 400, message: 'invalid' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-error')).toHaveTextContent('Failed to load entry.')
    })
  })

  it('renders the session-expired error on 401', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError({ kind: 'unauthorized', status: 401 }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-error')).toHaveTextContent('Session expired.')
    })
  })

  it('renders the network-error message on a non-ApiError throw', async () => {
    mockedGet.mockRejectedValueOnce(new TypeError('fetch failed'))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-error')).toHaveTextContent('Network error.')
    })
  })
})

describe('AdminEntryDetail — status-conditional action buttons', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  it('live entry: Delete + Purge visible; Approve/Reject/Restore hidden', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'live' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-entry-delete')).toBeInTheDocument()
    expect(screen.getByTestId('admin-entry-purge')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-entry-approve')).toBe(null)
    expect(screen.queryByTestId('admin-entry-reject')).toBe(null)
    expect(screen.queryByTestId('admin-entry-restore')).toBe(null)
  })

  it('pending entry: Approve + Reject + Purge visible; Delete/Restore hidden', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'pending' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-entry-approve')).toBeInTheDocument()
    expect(screen.getByTestId('admin-entry-reject')).toBeInTheDocument()
    expect(screen.getByTestId('admin-entry-purge')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-entry-delete')).toBe(null)
    expect(screen.queryByTestId('admin-entry-restore')).toBe(null)
  })

  it('deleted entry: Restore + Purge visible; Delete/Approve/Reject hidden', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'deleted' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-entry-restore')).toBeInTheDocument()
    expect(screen.getByTestId('admin-entry-purge')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-entry-delete')).toBe(null)
    expect(screen.queryByTestId('admin-entry-approve')).toBe(null)
  })
})

describe('AdminEntryDetail — confirmation modal flow', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedAction.mockReset()
    mockedPurge.mockReset()
    mockNavigate.mockReset()
  })

  it('disables the confirm button until the typed string matches the action label', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'live' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entry-delete'))

    expect(screen.getByTestId('admin-action-modal')).toBeInTheDocument()
    expect(screen.getByTestId('admin-action-confirm')).toBeDisabled()

    // Wrong typing — still disabled.
    await user.type(screen.getByTestId('admin-action-confirmation'), 'delete')
    expect(screen.getByTestId('admin-action-confirm')).toBeDisabled()

    // Right typing — DELETE label exactly. The modal expects an exact
    // match; locks the case-sensitive guard.
    await user.clear(screen.getByTestId('admin-action-confirmation'))
    await user.type(screen.getByTestId('admin-action-confirmation'), 'DELETE')
    expect(screen.getByTestId('admin-action-confirm')).not.toBeDisabled()
  })

  it('purge action requires the typed confirmation to be "<id> PURGE", not just "PURGE"', async () => {
    // Distinct from approve/reject/delete: purge's label includes the
    // full entry id. A user who only types "PURGE" or types the id alone
    // must be blocked. This guard is also enforced server-side, but the
    // client must not send a request that's known to fail.
    mockedGet.mockResolvedValueOnce(buildEntry({ id: 'aBcDeFgHiJ', status: 'live' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entry-purge'))

    await user.type(screen.getByTestId('admin-action-confirmation'), 'PURGE')
    expect(screen.getByTestId('admin-action-confirm')).toBeDisabled()
    await user.clear(screen.getByTestId('admin-action-confirmation'))
    await user.type(screen.getByTestId('admin-action-confirmation'), 'aBcDeFgHiJ PURGE')
    expect(screen.getByTestId('admin-action-confirm')).not.toBeDisabled()
  })

  it('confirm path: delete action fires entryAction(id, "delete", reason) then navigates back to /admin', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'live' }))
    mockedAction.mockResolvedValueOnce({
      status: 'ok',
      entry_id: 'aBcDeFgHiJ',
      action: 'delete',
    })
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entry-delete'))
    await user.type(screen.getByTestId('admin-action-confirmation'), 'DELETE')
    await user.type(screen.getByTestId('admin-action-reason'), 'spam')
    await user.click(screen.getByTestId('admin-action-confirm'))

    await waitFor(() => {
      expect(mockedAction).toHaveBeenCalledWith('aBcDeFgHiJ', 'delete', 'spam')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
    })
  })

  it('purge path: confirm fires purgeEntry(id, confirmation, reason)', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ id: 'aBcDeFgHiJ', status: 'live' }))
    mockedPurge.mockResolvedValueOnce({
      status: 'ok',
      entry_id: 'aBcDeFgHiJ',
      action: 'purge',
    })
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entry-purge'))
    await user.type(screen.getByTestId('admin-action-confirmation'), 'aBcDeFgHiJ PURGE')
    await user.click(screen.getByTestId('admin-action-confirm'))

    await waitFor(() => {
      expect(mockedPurge).toHaveBeenCalledWith('aBcDeFgHiJ', 'aBcDeFgHiJ PURGE', undefined)
    })
  })

  it('on rate_limited error: surfaces user-readable copy in the modal, never navigates', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'live' }))
    mockedAction.mockRejectedValueOnce(new ApiError({ kind: 'rate_limited', status: 429, retryAfterSeconds: 30 }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entry-delete'))
    await user.type(screen.getByTestId('admin-action-confirmation'), 'DELETE')
    await user.click(screen.getByTestId('admin-action-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('admin-action-error')).toHaveTextContent('Too many actions. Wait a moment, then retry.')
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('cancel button closes the modal AND clears the typed confirmation/reason', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ status: 'live' }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.click(screen.getByTestId('admin-entry-delete'))
    await user.type(screen.getByTestId('admin-action-confirmation'), 'partial')
    // Populate the reason field too so the post-cancel empty-value assertion
    // actually exercises the reason-reset path.
    await user.type(screen.getByTestId('admin-action-reason'), 'spam')
    await user.click(screen.getByTestId('admin-action-cancel'))
    expect(screen.queryByTestId('admin-action-modal')).toBe(null)

    // Re-open: the confirmation field should be empty again. Without the
    // clear, a half-typed dangerous string from a prior abandoned action
    // could carry over into a different action's modal — close to a UX
    // bug that auto-fires the wrong destructive action on the wrong row.
    await user.click(screen.getByTestId('admin-entry-delete'))
    expect(screen.getByTestId('admin-action-confirmation')).toHaveValue('')
    expect(screen.getByTestId('admin-action-reason')).toHaveValue('')
  })
})

describe('AdminEntryDetail — audit log render', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  it('renders the audit log table only when entries exist', async () => {
    mockedGet.mockResolvedValueOnce(
      buildEntry({
        audit_log: [
          {
            id: 'audit1',
            adminId: 'admin1',
            adminEmail: 'ops@admin.ai',
            action: 'delete',
            targetId: 'aBcDeFgHiJ',
            targetKind: 'post',
            details: 'spam',
            createdAt: '2026-04-23T13:00:00.000Z',
          },
        ],
      }),
    )
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-audit')).toBeInTheDocument()
    })
    const audit = screen.getByTestId('admin-entry-audit')
    // The audit row displays the admin email AND the recorded action.
    // Without the email column, an audit log without authorship is
    // useless for incident review — locks both pieces.
    expect(audit).toHaveTextContent('ops@admin.ai')
    expect(audit).toHaveTextContent('delete')
    expect(audit).toHaveTextContent('spam')
  })

  it('does NOT render the audit table when audit_log is empty', async () => {
    mockedGet.mockResolvedValueOnce(buildEntry({ audit_log: [] }))
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-detail')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('admin-entry-audit')).toBe(null)
  })

  it('renders "system" when adminEmail is null (system-generated audit row)', async () => {
    mockedGet.mockResolvedValueOnce(
      buildEntry({
        audit_log: [
          {
            id: 'audit2',
            adminId: null,
            adminEmail: null,
            action: 'auto-approve',
            targetId: 'aBcDeFgHiJ',
            targetKind: 'post',
            details: null,
            createdAt: '2026-04-23T13:00:00.000Z',
          },
        ],
      }),
    )
    renderDetail()
    await waitFor(() => {
      expect(screen.getByTestId('admin-entry-audit')).toBeInTheDocument()
    })
    expect(screen.getByTestId('admin-entry-audit')).toHaveTextContent('system')
  })
})
