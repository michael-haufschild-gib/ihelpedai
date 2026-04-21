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

/** Compute overdue status for a takedown. */
function overdueLevel(dateReceived: string, status: string): 'none' | 'warning' | 'danger' {
  if (status === 'closed') return 'none'
  const days = (Date.now() - new Date(dateReceived).getTime()) / (1000 * 60 * 60 * 24)
  if (days > 7) return 'danger'
  if (days > 5) return 'warning'
  return 'none'
}

/** Get today's date as YYYY-MM-DD string. */
function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Format date for display. */
function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

/** Admin takedown inbox page (Story 8). */
export function AdminTakedowns() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<Paginated<AdminTakedown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<AdminTakedown | null>(null)
  const [form, setForm] = useState(() => ({ requester_email: '', entry_id: '', reason: '', date_received: todayString() }))
  const [closeForm, setCloseForm] = useState({ disposition: '', notes: '' })
  const [refreshKey, setRefreshKey] = useState(0)

  const page = Number(searchParams.get('page') ?? '1')
  const statusFilter = (searchParams.get('status') ?? '') as 'open' | 'closed' | ''

  useEffect(() => {
    let cancelled = false
    listTakedowns({ status: statusFilter !== '' ? statusFilter : undefined, page })
      .then((d) => { if (!cancelled) { setData(d); setFetchError(null) } })
      .catch(() => { if (!cancelled) setFetchError('Failed to load takedowns.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, statusFilter, refreshKey])

  const handleCreate = () => {
    createTakedown({
      requester_email: form.requester_email !== '' ? form.requester_email : null,
      entry_id: form.entry_id !== '' ? form.entry_id : null,
      reason: form.reason, date_received: form.date_received,
    }).then(() => {
      setShowCreate(false)
      setForm({ requester_email: '', entry_id: '', reason: '', date_received: todayString() })
      setRefreshKey((k) => k + 1)
    }).catch(() => { showToast('Failed to create takedown.') })
  }

  const handleClose = () => {
    if (!showDetail) return
    const disposition = closeForm.disposition !== '' ? closeForm.disposition : undefined
    updateTakedown(showDetail.id, { status: 'closed', disposition, notes: closeForm.notes })
      .then(() => { setShowDetail(null); setRefreshKey((k) => k + 1) })
      .catch(() => undefined)
  }

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value !== '') next.set(key, value); else next.delete(key)
    next.set('page', '1')
    setSearchParams(next)
  }

  const setPage = (p: number) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('page', String(p)); return next })
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <section data-testid="admin-takedowns-page" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Takedown Requests</h1>
        <Button data-testid="admin-takedowns-create" size="sm" onClick={() => setShowCreate(true)}>New</Button>
      </div>
      <Select
        data-testid="admin-takedowns-status-filter"
        value={statusFilter}
        onChange={(v) => setFilter('status', v)}
        options={[
          { value: '', label: 'All' },
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ]}
      />
      {fetchError !== null && <p data-testid="admin-takedowns-error" className="text-sm text-danger">{fetchError}</p>}
      <TakedownList data={data} loading={loading} onClose={(td) => { setShowDetail(td); setCloseForm({ disposition: '', notes: td.notes }) }} />
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {showCreate && (
        <CreateModal form={form} onFormChange={setForm} onCreate={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {showDetail && (
        <CloseModal closeForm={closeForm} onFormChange={setCloseForm} onClose={handleClose} onCancel={() => setShowDetail(null)} />
      )}
    </section>
  )
}

/** Takedown list table or empty/loading state. */
function TakedownList({ data, loading, onClose }: {
  data: Paginated<AdminTakedown> | null
  loading: boolean
  onClose: (td: AdminTakedown) => void
}) {
  if (loading) return <p className="text-text-secondary">Loading...</p>
  if (!data || data.items.length === 0) {
    return <p data-testid="admin-takedowns-empty" className="text-text-secondary">No takedown requests.</p>
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
          <Button data-testid={`admin-takedown-close-${item.id}`} size="sm" onClick={onClose}>Close</Button>
        )}
      </td>
    </tr>
  )
}

/** Modal for creating a new takedown. */
function CreateModal({ form, onFormChange, onCreate, onClose }: {
  form: { requester_email: string; entry_id: string; reason: string; date_received: string }
  onFormChange: (f: typeof form) => void
  onCreate: () => void
  onClose: () => void
}) {
  return (
    <Modal data-testid="admin-takedown-create-modal" isOpen title="New takedown request" onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <Input data-testid="admin-takedown-email" placeholder="Requester email" value={form.requester_email} onChange={(e) => onFormChange({ ...form, requester_email: e.target.value })} />
        <Input data-testid="admin-takedown-entry-id" placeholder="Entry ID (optional)" value={form.entry_id} onChange={(e) => onFormChange({ ...form, entry_id: e.target.value })} />
        <Textarea data-testid="admin-takedown-reason" placeholder="Reason" value={form.reason} onChange={(e) => onFormChange({ ...form, reason: e.target.value })} />
        <Input data-testid="admin-takedown-date" type="date" value={form.date_received} onChange={(e) => onFormChange({ ...form, date_received: e.target.value })} />
        <div className="flex gap-2">
          <Button data-testid="admin-takedown-submit" disabled={form.reason === ''} onClick={onCreate}>Create</Button>
          <Button data-testid="admin-takedown-create-cancel" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Modal for closing a takedown. */
function CloseModal({ closeForm, onFormChange, onClose, onCancel }: {
  closeForm: { disposition: string; notes: string }
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
        <Textarea data-testid="admin-takedown-notes" placeholder="Notes" value={closeForm.notes} onChange={(e) => onFormChange({ ...closeForm, notes: e.target.value })} />
        <div className="flex gap-2">
          <Button data-testid="admin-takedown-close-confirm" disabled={closeForm.disposition === ''} onClick={onClose}>Close takedown</Button>
          <Button data-testid="admin-takedown-close-cancel" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
