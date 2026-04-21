import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { AuditEntry, Paginated } from '@/lib/adminApi'
import { listAuditLog } from '@/lib/adminApi'

const ACTIONS = [
  'approve', 'reject', 'delete', 'restore', 'purge',
  'revoke_key', 'create_admin', 'deactivate_admin',
  'password_reset', 'password_change',
  'update_setting', 'create_takedown', 'update_takedown',
]

/** Admin audit log viewer (Story 10). */
export function AdminAuditLog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<Paginated<AuditEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const page = Number(searchParams.get('page') ?? '1')
  const action = searchParams.get('action') ?? ''
  const dateFrom = searchParams.get('date_from') ?? ''
  const dateTo = searchParams.get('date_to') ?? ''

  useEffect(() => {
    let cancelled = false
    listAuditLog({
      action: action !== '' ? action : undefined,
      date_from: dateFrom !== '' ? dateFrom : undefined,
      date_to: dateTo !== '' ? dateTo : undefined,
      page,
    })
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch(() => { if (!cancelled) setError('Failed to load audit log.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, action, dateFrom, dateTo])

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value !== '') next.set(key, value)
    else next.delete(key)
    next.set('page', '1')
    setSearchParams(next)
  }

  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(p))
    setSearchParams(next)
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <section data-testid="admin-audit-page" className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <AuditFilters action={action} dateFrom={dateFrom} dateTo={dateTo} onFilter={setFilter} />
      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : error !== null ? (
        <p data-testid="admin-audit-error" className="text-sm text-danger">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <p data-testid="admin-audit-empty" className="text-text-secondary">No audit entries.</p>
      ) : (
        <>
          <AuditTable items={data.items} />
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Audit log filter bar. */
function AuditFilters({ action, dateFrom, dateTo, onFilter }: {
  action: string
  dateFrom: string
  dateTo: string
  onFilter: (key: string, value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Select
        data-testid="admin-audit-action-filter"
        value={action}
        onChange={(v) => onFilter('action', v)}
        options={[
          { value: '', label: 'All actions' },
          ...ACTIONS.map((a) => ({ value: a, label: a })),
        ]}
      />
      <Input
        data-testid="admin-audit-date-from"
        type="date"
        value={dateFrom}
        onChange={(e) => onFilter('date_from', e.target.value)}
      />
      <Input
        data-testid="admin-audit-date-to"
        type="date"
        value={dateTo}
        onChange={(e) => onFilter('date_to', e.target.value)}
      />
    </div>
  )
}

/** Audit log table body. */
function AuditTable({ items }: { items: AuditEntry[] }) {
  return (
    <table data-testid="admin-audit-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle text-left text-text-secondary">
          <th className="py-2 pr-3">Date</th>
          <th className="py-2 pr-3">Admin</th>
          <th className="py-2 pr-3">Action</th>
          <th className="py-2 pr-3">Target</th>
          <th className="py-2">Details</th>
        </tr>
      </thead>
      <tbody>
        {items.map((entry) => (
          <tr key={entry.id} data-testid={`admin-audit-row-${entry.id}`} className="border-b border-border-subtle">
            <td className="py-2 pr-3 text-text-secondary">{new Date(entry.createdAt).toLocaleString()}</td>
            <td className="py-2 pr-3">{entry.adminEmail ?? 'system'}</td>
            <td className="py-2 pr-3">{entry.action}</td>
            <td className="py-2 pr-3 font-mono text-2xs">{entry.targetId ?? '—'} {entry.targetKind !== null ? `(${entry.targetKind})` : ''}</td>
            <td className="py-2 text-text-secondary">{entry.details ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
