import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import type { AdminEntry, Paginated } from '@/lib/adminApi'
import { bulkQueueAction, listQueue, queueAction } from '@/lib/adminApi'
import { ApiError } from '@/lib/api'
import { showToast } from '@/stores/toastStore'

/**
 * Translate an admin-action failure into a one-line user-visible message.
 * Distinguishing rate_limited / unauthorized / network from the generic
 * fall-through helps the admin decide whether to retry, re-login, or wait.
 */
function describeAdminActionError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === 'unauthorized') return 'Session expired. Sign in again to continue.'
    if (err.kind === 'rate_limited') return 'Too many actions. Wait a moment, then retry.'
    if (err.status === 0) return 'Network unreachable. Check your connection and retry.'
    if (typeof err.message === 'string' && err.message !== '') return err.message
  }
  return 'Action failed. Try again.'
}

/** Admin moderation queue page (Story 6). */
export function AdminQueue() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<Paginated<AdminEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(() => new Set<string>())
  const [inlineReason, setInlineReason] = useState<Record<string, string>>({})
  const [actionTarget, setActionTarget] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const page = Number(searchParams.get('page') ?? '1')

  useEffect(() => {
    let cancelled = false
    listQueue(page)
      .then((d) => { if (!cancelled) { setData(d); setSelected(new Set()); setError(null) } })
      .catch(() => { if (!cancelled) setError('Failed to load queue.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, refreshKey])

  // Surface failures via the global toast store so admins know an action
  // didn't take effect. The toast store uses Zustand singleton state and is
  // safe to call from any handler.
  const handleAction = (id: string, action: 'approve' | 'reject') => {
    const reasonValue = inlineReason[id]
    queueAction(id, action, reasonValue !== undefined && reasonValue !== '' ? reasonValue : undefined)
      .then(() => setRefreshKey((k) => k + 1))
      .catch((err: unknown) => { showToast(describeAdminActionError(err)) })
  }

  const handleBulk = (action: 'approve' | 'reject') => {
    if (selected.size === 0) return
    bulkQueueAction([...selected], action)
      .then(() => setRefreshKey((k) => k + 1))
      .catch((err: unknown) => { showToast(describeAdminActionError(err)) })
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (!data) return
    if (selected.size === data.items.length) setSelected(new Set())
    else setSelected(new Set(data.items.map((i) => i.id)))
  }

  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(p))
    setSearchParams(next)
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <section data-testid="admin-queue-page" className="flex flex-col gap-4">
      <QueueHeader total={data?.total} selectedCount={selected.size} onBulk={handleBulk} />
      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : error !== null ? (
        <p data-testid="admin-queue-error" className="text-sm text-danger">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <p data-testid="admin-queue-empty" className="text-text-secondary">Queue is empty. Nothing to review.</p>
      ) : (
        <>
          <QueueTable
            items={data.items}
            selected={selected}
            actionTarget={actionTarget}
            pendingAction={pendingAction}
            inlineReason={inlineReason}
            onToggleAll={toggleAll}
            onToggleSelect={toggleSelect}
            onAction={handleAction}
            onSetAction={(id, action) => { setActionTarget(id); setPendingAction(action) }}
            onReasonChange={(id, value) => setInlineReason((r) => ({ ...r, [id]: value }))}
          />
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button data-testid="admin-queue-prev" variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
              <Button data-testid="admin-queue-next" variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Queue page header with bulk actions. */
function QueueHeader({ total, selectedCount, onBulk }: {
  total: number | undefined
  selectedCount: number
  onBulk: (action: 'approve' | 'reject') => void
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Moderation Queue</h1>
        {total !== undefined && <span data-testid="admin-queue-count" className="text-sm text-text-secondary">{total} pending</span>}
      </div>
      {selectedCount > 0 && (
        <div className="flex gap-2">
          <Button data-testid="admin-queue-bulk-approve" size="sm" onClick={() => onBulk('approve')}>
            Approve {selectedCount} selected
          </Button>
          <Button data-testid="admin-queue-bulk-reject" size="sm" variant="danger" onClick={() => onBulk('reject')}>
            Reject {selectedCount} selected
          </Button>
        </div>
      )}
    </>
  )
}

/** Queue table with selection and inline actions. */
function QueueTable({ items, selected, actionTarget, pendingAction, inlineReason, onToggleAll, onToggleSelect, onAction, onSetAction, onReasonChange }: {
  items: AdminEntry[]
  selected: Set<string>
  actionTarget: string | null
  pendingAction: 'approve' | 'reject' | null
  inlineReason: Record<string, string>
  onToggleAll: () => void
  onToggleSelect: (id: string) => void
  onAction: (id: string, action: 'approve' | 'reject') => void
  onSetAction: (id: string, action: 'approve' | 'reject') => void
  onReasonChange: (id: string, value: string) => void
}) {
  return (
    <table data-testid="admin-queue-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle text-left text-text-secondary">
          <th className="py-2 pr-2">
            <Checkbox
              data-testid="admin-queue-select-all"
              checked={items.length > 0 && selected.size === items.length}
              onChange={onToggleAll}
            />
          </th>
          <th className="py-2 pr-3">ID</th>
          <th className="py-2 pr-3">Header</th>
          <th className="py-2 pr-3">Model</th>
          <th className="py-2 pr-3">Date</th>
          <th className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((entry) => (
          <QueueRow
            key={entry.id}
            entry={entry}
            isSelected={selected.has(entry.id)}
            isActionTarget={actionTarget === entry.id}
            pendingAction={actionTarget === entry.id ? pendingAction : null}
            reason={inlineReason[entry.id] ?? ''}
            onToggle={() => onToggleSelect(entry.id)}
            onAction={(action) => onAction(entry.id, action)}
            onSetAction={(action) => onSetAction(entry.id, action)}
            onReasonChange={(value) => onReasonChange(entry.id, value)}
          />
        ))}
      </tbody>
    </table>
  )
}

/** Format a date string for table display. */
function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

/** Single queue table row. */
function QueueRow({ entry, isSelected, isActionTarget, pendingAction, reason, onToggle, onAction, onSetAction, onReasonChange }: {
  entry: AdminEntry
  isSelected: boolean
  isActionTarget: boolean
  pendingAction: 'approve' | 'reject' | null
  reason: string
  onToggle: () => void
  onAction: (action: 'approve' | 'reject') => void
  onSetAction: (action: 'approve' | 'reject') => void
  onReasonChange: (value: string) => void
}) {
  const dateDisplay = formatDateShort(entry.createdAt)
  return (
    <tr
      data-testid={`admin-queue-row-${entry.id}`}
      className="border-b border-border-subtle hover:bg-surface"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        if (e.key === 'a') onSetAction('approve')
        if (e.key === 'r') onSetAction('reject')
      }}
    >
      <td className="py-2 pr-2">
        <Checkbox data-testid={`admin-queue-select-${entry.id}`} checked={isSelected} onChange={onToggle} />
      </td>
      <td className="py-2 pr-3">
        <Link to={`/admin/entries/${entry.id}`} data-testid={`admin-queue-link-${entry.id}`} className="text-accent hover:underline">
          {entry.id}
        </Link>
      </td>
      <td className="py-2 pr-3 max-w-xs truncate">{entry.header}</td>
      <td className="py-2 pr-3 text-text-secondary">{entry.selfReportedModel ?? '—'}</td>
      <td className="py-2 pr-3 text-text-secondary">{dateDisplay}</td>
      <td className="py-2">
        {isActionTarget && pendingAction !== null ? (
          <div className="flex items-center gap-1">
            <Input
              data-testid={`admin-queue-reason-${entry.id}`}
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAction(pendingAction) }}
              className="w-40"
            />
            <Button data-testid={`admin-queue-confirm-${entry.id}`} size="sm" variant={pendingAction === 'reject' ? 'danger' : 'primary'} onClick={() => onAction(pendingAction)}>
              {pendingAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button data-testid={`admin-queue-approve-${entry.id}`} size="sm" onClick={() => onSetAction('approve')}>Approve</Button>
            <Button data-testid={`admin-queue-reject-${entry.id}`} size="sm" variant="danger" onClick={() => onSetAction('reject')}>Reject</Button>
          </div>
        )}
      </td>
    </tr>
  )
}
