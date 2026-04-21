import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { AdminEntry, EntryFilters, Paginated } from '@/lib/adminApi'
import { listEntries } from '@/lib/adminApi'

/** Entry status badge. */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    live: 'bg-success/20 text-success',
    pending: 'bg-warning/20 text-warning',
    deleted: 'bg-danger/20 text-danger',
  }
  return (
    <span data-testid="entry-status" className={`rounded px-2 py-0.5 text-2xs font-medium ${colors[status] ?? ''}`}>
      {status}
    </span>
  )
}

/** Admin entries list page (Story 3). */
export function AdminEntries() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<Paginated<AdminEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const entryTypeRaw = searchParams.get('entry_type') ?? ''
  const statusRaw = searchParams.get('status') ?? ''
  const q = searchParams.get('q') ?? ''
  const sortRaw = searchParams.get('sort') ?? 'desc'
  const sort: 'asc' | 'desc' = sortRaw === 'asc' ? 'asc' : 'desc'

  const entryType = (entryTypeRaw === 'post' || entryTypeRaw === 'report') ? entryTypeRaw : undefined
  const status = (statusRaw === 'live' || statusRaw === 'pending' || statusRaw === 'deleted') ? statusRaw : undefined

  useEffect(() => {
    let cancelled = false
    const filters: EntryFilters = { page, sort }
    if (entryType !== undefined) filters.entry_type = entryType
    if (status !== undefined) filters.status = status
    if (q !== '') filters.q = q
    listEntries(filters)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch(() => { if (!cancelled) setError('Failed to load entries.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, entryType, status, q, sort])

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
    <section data-testid="admin-entries-page" className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Entries</h1>
      <EntriesFilters
        entryType={entryTypeRaw}
        status={statusRaw}
        q={q}
        sort={sort}
        onFilter={setFilter}
      />
      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : error !== null ? (
        <p data-testid="admin-entries-error" className="text-sm text-danger">{error}</p>
      ) : !data || data.items.length === 0 ? (
        <p data-testid="admin-entries-empty" className="text-text-secondary">No entries match your filters.</p>
      ) : (
        <>
          <EntriesTable items={data.items} />
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button data-testid="admin-entries-prev" variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Prev
              </Button>
              <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
              <Button data-testid="admin-entries-next" variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Filter bar for entries page. */
function EntriesFilters({ entryType, status, q, sort, onFilter }: {
  entryType: string
  status: string
  q: string
  sort: string
  onFilter: (key: string, value: string) => void
}) {
  const [localQ, setLocalQ] = useState(q)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handleSearch = (value: string) => {
    setLocalQ(value)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onFilter('q', value), 300)
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Select
        data-testid="admin-entries-type-filter"
        value={entryType}
        onChange={(v) => onFilter('entry_type', v)}
        options={[
          { value: '', label: 'All types' },
          { value: 'post', label: 'Helped' },
          { value: 'report', label: 'Report' },
        ]}
      />
      <Select
        data-testid="admin-entries-status-filter"
        value={status}
        onChange={(v) => onFilter('status', v)}
        options={[
          { value: '', label: 'All statuses' },
          { value: 'live', label: 'Live' },
          { value: 'pending', label: 'Pending' },
          { value: 'deleted', label: 'Deleted' },
        ]}
      />
      <Input
        data-testid="admin-entries-search"
        placeholder="Search..."
        value={localQ}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-48"
      />
      <Button
        data-testid="admin-entries-sort-toggle"
        variant="ghost"
        size="sm"
        onClick={() => onFilter('sort', sort === 'desc' ? 'asc' : 'desc')}
      >
        {sort === 'desc' ? 'Newest first' : 'Oldest first'}
      </Button>
    </div>
  )
}

/** Table of admin entries. */
function EntriesTable({ items }: { items: AdminEntry[] }) {
  return (
    <table data-testid="admin-entries-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle text-left text-text-secondary">
          <th className="py-2 pr-3">Type</th>
          <th className="py-2 pr-3">ID</th>
          <th className="py-2 pr-3">Header</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3">Source</th>
          <th className="py-2">Date</th>
        </tr>
      </thead>
      <tbody>
        {items.map((entry) => (
          <tr key={entry.id} data-testid={`admin-entry-row-${entry.id}`} className="border-b border-border-subtle hover:bg-surface">
            <td className="py-2 pr-3 capitalize">{entry.entryType}</td>
            <td className="py-2 pr-3">
              <Link
                to={`/admin/entries/${entry.id}`}
                data-testid={`admin-entry-link-${entry.id}`}
                className="text-accent hover:underline"
              >
                {entry.id}
              </Link>
            </td>
            <td className="py-2 pr-3 max-w-xs truncate">{entry.header}</td>
            <td className="py-2 pr-3"><StatusBadge status={entry.status} /></td>
            <td className="py-2 pr-3 text-text-secondary">
              {entry.source === 'api' ? `API${entry.selfReportedModel !== null ? ` (${entry.selfReportedModel})` : ''}` : 'Form'}
            </td>
            <td className="py-2 text-text-secondary">{new Date(entry.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
