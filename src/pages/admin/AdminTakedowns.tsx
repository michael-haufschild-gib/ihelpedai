import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import type { AdminTakedown, Paginated } from '@/lib/adminApi'
import { createTakedown, listTakedowns, updateTakedown } from '@/lib/adminApi'
import { showToast } from '@/stores/toastStore'

/**
 * Parse a calendar date as local midnight. Accepts bare YYYY-MM-DD (what
 * SqliteStore returns) or a full ISO-8601 datetime (what MysqlStore emits
 * via `Date.prototype.toISOString()` on a DATE column). Without the slice
 * the MySQL path's 'YYYY-MM-DDT00:00:00.000Z' split produces NaN for day
 * and the caller renders "Invalid Date".
 */
function parseCalendarDate(dateStr: string): Date {
  const calendar = dateStr.slice(0, 10)
  // Reject anything that is not a strict YYYY-MM-DD prefix. Otherwise an
  // empty/short value silently becomes new Date(0, -1, 0) — a bogus
  // 1899-ish date that would render in the table and trigger overdue
  // badges instead of a clear "Invalid Date".
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendar)) return new Date(Number.NaN)
  const y = Number(calendar.slice(0, 4))
  const m = Number(calendar.slice(5, 7))
  const d = Number(calendar.slice(8, 10))
  return new Date(y, m - 1, d)
}

/** Compute overdue status for a takedown. */
function overdueLevel(dateReceived: string, status: string): 'none' | 'warning' | 'danger' {
  if (status === 'closed') return 'none'
  const days = (Date.now() - parseCalendarDate(dateReceived).getTime()) / (1000 * 60 * 60 * 24)
  if (days > 7) return 'danger'
  if (days > 5) return 'warning'
  return 'none'
}

/** Get today's date as YYYY-MM-DD string using local date parts. */
function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Format date for display. */
function formatDateShort(iso: string): string {
  return parseCalendarDate(iso).toLocaleDateString()
}

type TakedownStatusFilter = '' | 'open' | 'closed'

/** Subscribe to a paginated takedowns list with loading/error reset on every refetch. */
function useTakedownsData(
  page: number,
  statusFilter: TakedownStatusFilter,
  refreshKey: number,
): { data: Paginated<AdminTakedown> | null; loading: boolean; fetchError: string | null } {
  const [data, setData] = useState<Paginated<AdminTakedown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    // Reset error/loading inside a promise callback rather than synchronously in
    // the effect body — both `react-hooks/set-state-in-effect` and the React
    // docs forbid sync setState here, but we still want a stale error/data
    // state cleared on refetch so a returning request paints fresh state.
    Promise.resolve()
      .then(() => {
        if (cancelled) return
        setLoading(true)
        setFetchError(null)
      })
      .then(() => listTakedowns({ status: statusFilter !== '' ? statusFilter : undefined, page }))
      .then((d) => {
        if (cancelled) return
        setData(d)
        setFetchError(null)
      })
      .catch(() => {
        if (cancelled) return
        setFetchError('Failed to load takedowns.')
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, statusFilter, refreshKey])
  return { data, loading, fetchError }
}

/** Read-only paging/filter state derived from the URL. */
function useTakedownsFilters(): {
  page: number
  statusFilter: TakedownStatusFilter
  setFilter: (key: string, value: string) => void
  setPage: (p: number) => void
} {
  const [searchParams, setSearchParams] = useSearchParams()
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const statusRaw = searchParams.get('status') ?? ''
  const statusFilter: TakedownStatusFilter = statusRaw === 'open' || statusRaw === 'closed' ? statusRaw : ''
  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value !== '') next.set(key, value)
      else next.delete(key)
      next.set('page', '1')
      return next
    })
  }
  const setPage = (p: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(p))
      return next
    })
  }
  return { page, statusFilter, setFilter, setPage }
}

type CreateForm = { requester_email: string; entry_id: string; reason: string; date_received: string }
type CloseFormState = { disposition: string; notes: string }

const blankCreateForm = (): CreateForm => ({
  requester_email: '',
  entry_id: '',
  reason: '',
  date_received: todayString(),
})

/** Submit a new takedown, reset the form on success, toast on failure. */
function submitCreate(form: CreateForm, setMutating: (b: boolean) => void, onDone: () => void): void {
  setMutating(true)
  createTakedown({
    requester_email: form.requester_email !== '' ? form.requester_email : null,
    entry_id: form.entry_id !== '' ? form.entry_id : null,
    reason: form.reason,
    date_received: form.date_received,
  })
    .then(onDone)
    .catch(() => showToast('Failed to create takedown.'))
    .finally(() => setMutating(false))
}

/** Close a takedown with a disposition, toast on failure. */
function submitClose(id: string, state: CloseFormState, setMutating: (b: boolean) => void, onDone: () => void): void {
  setMutating(true)
  const disposition = state.disposition !== '' ? state.disposition : undefined
  updateTakedown(id, { status: 'closed', disposition, notes: state.notes })
    .then(onDone)
    .catch(() => showToast('Failed to close takedown.'))
    .finally(() => setMutating(false))
}

/** Header strip: title + "New" button. */
function PageHeader({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <h1 className="text-xl font-semibold">Takedown Requests</h1>
      <Button data-testid="admin-takedowns-create" size="sm" onClick={onNew}>
        New
      </Button>
    </div>
  )
}

/** Status filter dropdown. */
function StatusFilter({ value, onChange }: { value: TakedownStatusFilter; onChange: (v: string) => void }) {
  return (
    <Select
      data-testid="admin-takedowns-status-filter"
      value={value}
      onChange={onChange}
      options={[
        { value: '', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ]}
    />
  )
}

/** Pagination controls. */
function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Button>
      <span className="text-sm text-text-secondary">
        Page {page} of {totalPages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  )
}

/** Admin takedown inbox page (Story 8). */
export function AdminTakedowns() {
  const { page, statusFilter, setFilter, setPage } = useTakedownsFilters()
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<AdminTakedown | null>(null)
  const [form, setForm] = useState<CreateForm>(blankCreateForm)
  const [closeForm, setCloseForm] = useState<CloseFormState>({ disposition: '', notes: '' })
  const [mutating, setMutating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, loading, fetchError } = useTakedownsData(page, statusFilter, refreshKey)

  const handleCreate = () => {
    if (mutating) return
    submitCreate(form, setMutating, () => {
      setShowCreate(false)
      setForm(blankCreateForm())
      setRefreshKey((k) => k + 1)
    })
  }

  const handleClose = () => {
    if (!showDetail || mutating) return
    submitClose(showDetail.id, closeForm, setMutating, () => {
      setShowDetail(null)
      setRefreshKey((k) => k + 1)
    })
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <section data-testid="admin-takedowns-page" className="flex flex-col gap-4">
      <PageHeader onNew={() => setShowCreate(true)} />
      <StatusFilter value={statusFilter} onChange={(v) => setFilter('status', v)} />
      {fetchError !== null ? (
        <p data-testid="admin-takedowns-error" className="text-sm text-danger">
          {fetchError}
        </p>
      ) : (
        <TakedownList
          data={data}
          loading={loading}
          onClose={(td) => {
            setShowDetail(td)
            setCloseForm({ disposition: '', notes: td.notes })
          }}
        />
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
      {showCreate && (
        <CreateModal
          form={form}
          saving={mutating}
          onFormChange={setForm}
          onCreate={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showDetail && (
        <CloseModal
          closeForm={closeForm}
          saving={mutating}
          onFormChange={setCloseForm}
          onClose={handleClose}
          onCancel={() => setShowDetail(null)}
        />
      )}
    </section>
  )
}

/** Takedown list table or empty/loading state. */
function TakedownList({
  data,
  loading,
  onClose,
}: {
  data: Paginated<AdminTakedown> | null
  loading: boolean
  onClose: (td: AdminTakedown) => void
}) {
  if (loading) return <p className="text-text-secondary">Loading...</p>
  if (!data || data.items.length === 0) {
    return (
      <p data-testid="admin-takedowns-empty" className="text-text-secondary">
        No takedown requests.
      </p>
    )
  }
  return (
    <table data-testid="admin-takedowns-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle text-left text-text-secondary">
          <th className="py-2 pr-3">Date</th>
          <th className="py-2 pr-3">Entry</th>
          <th className="py-2 pr-3">Reason</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((td) => (
          <TakedownRow key={td.id} item={td} onClose={() => onClose(td)} />
        ))}
      </tbody>
    </table>
  )
}

/** Individual takedown row. */
function TakedownRow({ item, onClose }: { item: AdminTakedown; onClose: () => void }) {
  const overdue = overdueLevel(item.dateReceived, item.status)
  const dateDisplay = formatDateShort(item.dateReceived)
  return (
    <tr data-testid={`admin-takedown-row-${item.id}`} className="border-b border-border-subtle hover:bg-surface">
      <td className="py-2 pr-3 text-text-secondary">
        {dateDisplay}
        {overdue === 'warning' && <span className="ml-1 text-warning">!</span>}
        {overdue === 'danger' && <span className="ml-1 text-danger">!!</span>}
      </td>
      <td className="py-2 pr-3 font-mono text-2xs">{item.entryId ?? '—'}</td>
      <td className="py-2 pr-3 max-w-xs truncate">{item.reason}</td>
      <td className="py-2 pr-3 capitalize">{item.status}</td>
      <td className="py-2">
        {item.status === 'open' && (
          <Button data-testid={`admin-takedown-close-${item.id}`} size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </td>
    </tr>
  )
}

/** Modal for creating a new takedown. */
function CreateModal({
  form,
  saving,
  onFormChange,
  onCreate,
  onClose,
}: {
  form: { requester_email: string; entry_id: string; reason: string; date_received: string }
  saving: boolean
  onFormChange: (f: typeof form) => void
  onCreate: () => void
  onClose: () => void
}) {
  return (
    <Modal data-testid="admin-takedown-create-modal" isOpen title="New takedown request" onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <Input
          data-testid="admin-takedown-email"
          placeholder="Requester email"
          value={form.requester_email}
          onChange={(e) => onFormChange({ ...form, requester_email: e.target.value })}
        />
        <Input
          data-testid="admin-takedown-entry-id"
          placeholder="Entry ID (optional)"
          value={form.entry_id}
          onChange={(e) => onFormChange({ ...form, entry_id: e.target.value })}
        />
        <Textarea
          data-testid="admin-takedown-reason"
          placeholder="Reason"
          value={form.reason}
          onChange={(e) => onFormChange({ ...form, reason: e.target.value })}
        />
        <Input
          data-testid="admin-takedown-date"
          type="date"
          value={form.date_received}
          onChange={(e) => onFormChange({ ...form, date_received: e.target.value })}
        />
        <div className="flex gap-2">
          <Button data-testid="admin-takedown-submit" disabled={form.reason === '' || saving} onClick={onCreate}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
          <Button data-testid="admin-takedown-create-cancel" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Modal for closing a takedown. */
function CloseModal({
  closeForm,
  saving,
  onFormChange,
  onClose,
  onCancel,
}: {
  closeForm: { disposition: string; notes: string }
  saving: boolean
  onFormChange: (f: typeof closeForm) => void
  onClose: () => void
  onCancel: () => void
}) {
  return (
    <Modal data-testid="admin-takedown-close-modal" isOpen title="Close takedown" onClose={onCancel}>
      <div className="flex flex-col gap-4 p-4">
        <Select
          data-testid="admin-takedown-disposition"
          value={closeForm.disposition}
          onChange={(v) => onFormChange({ ...closeForm, disposition: v })}
          options={[
            { value: '', label: 'Select disposition' },
            { value: 'entry_deleted', label: 'Entry deleted' },
            { value: 'entry_kept', label: 'Entry kept (no violation)' },
            { value: 'entry_edited', label: 'Entry edited' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Textarea
          data-testid="admin-takedown-notes"
          placeholder="Notes"
          value={closeForm.notes}
          onChange={(e) => onFormChange({ ...closeForm, notes: e.target.value })}
        />
        <div className="flex gap-2">
          <Button
            data-testid="admin-takedown-close-confirm"
            disabled={closeForm.disposition === '' || saving}
            onClick={onClose}
          >
            {saving ? 'Closing...' : 'Close takedown'}
          </Button>
          <Button data-testid="admin-takedown-close-cancel" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
