import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ReportCard } from '@/features/reports/ReportCard'
import {
  ApiError,
  fetchMyVotes,
  listReports,
  type Paginated,
  type Report,
} from '@/lib/api'

const DEBOUNCE_MS = 300
const PAGE_SIZE = 20

type LoadStateInner =
  | { kind: 'loaded'; data: Paginated<Report> }
  | { kind: 'error'; message: string }

type LoadState = { kind: 'loading' } | LoadStateInner

/** Read the ?q and ?page query string into local state values. */
function useReportsQuery(): {
  q: string
  page: number
  setQ: (value: string) => void
  setPage: (value: number) => void
} {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const setQ = (value: string): void => {
    const next = new URLSearchParams(params)
    if (value === '') next.delete('q')
    else next.set('q', value)
    next.delete('page')
    setParams(next, { replace: true })
  }
  const setPage = (value: number): void => {
    const next = new URLSearchParams(params)
    if (value <= 1) next.delete('page')
    else next.set('page', String(value))
    setParams(next, { replace: true })
  }
  return { q, page, setQ, setPage }
}

/** Debounce a value by {@link DEBOUNCE_MS}. */
function useDebounced<T>(value: T): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(value)
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(handle)
    }
  }, [value])
  return debounced
}

/** Fetch which of the given slugs this viewer has concurred on. Tolerates errors. */
function useMyConcurs(slugsKey: string): Set<string> {
  const [voted, setVoted] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (slugsKey === '') return undefined
    const slugs = slugsKey.split(',')
    let cancelled = false
    fetchMyVotes('report', slugs)
      .then((r) => {
        if (!cancelled) setVoted(new Set(r.voted))
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [slugsKey])
  return voted
}

/** Fetch reports and track loading/error state. Re-fetches when q or page change. */
function useReports(q: string, page: number): LoadState {
  const [result, setResult] = useState<{ key: string; inner: LoadStateInner } | null>(
    null,
  )
  const requestKey = `${q}\u0000${String(page)}`
  useEffect(() => {
    const key = `${q}\u0000${String(page)}`
    let cancelled = false
    listReports({ q: q === '' ? undefined : q, page })
      .then((data) => {
        if (!cancelled) setResult({ key, inner: { kind: 'loaded', data } })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof ApiError ? err.message : 'Could not load reports.'
        setResult({ key, inner: { kind: 'error', message } })
      })
    return () => {
      cancelled = true
    }
  }, [q, page])
  if (result === null || result.key !== requestKey) return { kind: 'loading' }
  return result.inner
}

/** Empty state for no entries at all vs. filtered-but-empty search. */
function EmptyState({ hasQuery, onClear }: { hasQuery: boolean; onClear: () => void }) {
  if (hasQuery) {
    return (
      <div data-testid="reports-empty-search" className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-secondary">No reports match your search.</p>
        <Button data-testid="reports-clear-search" variant="ghost" size="sm" onClick={onClear}>
          Clear search
        </Button>
      </div>
    )
  }
  return (
    <p data-testid="reports-empty" className="text-sm text-text-secondary">
      Nothing reported yet. Peace holds.
    </p>
  )
}

function Pager({
  page,
  total,
  onChange,
}: {
  page: number
  total: number
  onChange: (page: number) => void
}) {
  const hasMore = total > page * PAGE_SIZE
  return (
    <div className="flex items-center gap-3">
      <Button
        data-testid="reports-newer"
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => {
          onChange(page - 1)
        }}
      >
        Newer
      </Button>
      <span data-testid="reports-page" className="text-xs text-text-secondary">
        Page {page}
      </span>
      <Button
        data-testid="reports-older"
        variant="ghost"
        size="sm"
        disabled={!hasMore}
        onClick={() => {
          onChange(page + 1)
        }}
      >
        Older
      </Button>
    </div>
  )
}

function ReportsList({
  items,
  voted,
}: {
  items: Report[]
  voted: Set<string>
}) {
  return (
    <ul data-testid="reports-list" className="flex flex-col gap-4">
      {items.map((report) => (
        <li key={report.slug} data-testid={`reports-item-${report.slug}`}>
          <ReportCard
            report={report}
            mode="feed"
            voted={voted.has(report.slug)}
            data-testid={`reports-card-${report.slug}`}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * Reports feed page (PRD 01 Story 5). Paginated list with 300ms-debounced
 * search, URL-synced `?q=` and `?page=`, and a prominent "Report someone"
 * call-to-action linking to `/reports/new`.
 */
export function Reports() {
  const { q, page, setQ, setPage } = useReportsQuery()
  const [qInput, setQInput] = useState(q)
  const debouncedQ = useDebounced(qInput)
  useEffect(() => {
    if (debouncedQ !== q) setQ(debouncedQ)
  }, [debouncedQ, q, setQ])

  const state = useReports(q, page)
  const hasQuery = q !== ''

  const items = state.kind === 'loaded' ? state.data.items : []
  const votedSet = useMyConcurs(items.map((i) => i.slug).join(','))

  return (
    <section data-testid="page-reports" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 data-testid="page-reports-heading" className="text-2xl font-semibold text-text-primary">
          Reports
        </h1>
        <Link
          to="/reports/new"
          data-testid="reports-report-someone"
          className="btn btn-primary btn-md"
        >
          Report someone
        </Link>
      </div>
      <Input
        label="Search"
        data-testid="reports-search"
        value={qInput}
        onChange={(e) => {
          setQInput(e.target.value)
        }}
        placeholder="Search reports"
      />
      {state.kind === 'loading' && (
        <p data-testid="reports-loading" className="text-sm text-text-secondary">
          Loading…
        </p>
      )}
      {state.kind === 'error' && (
        <p data-testid="reports-error" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.kind === 'loaded' && state.data.items.length === 0 && (
        <EmptyState
          hasQuery={hasQuery}
          onClear={() => {
            setQInput('')
            setQ('')
          }}
        />
      )}
      {state.kind === 'loaded' && state.data.items.length > 0 && (
        <>
          <ReportsList items={state.data.items} voted={votedSet} />
          <Pager page={page} total={state.data.total} onChange={setPage} />
        </>
      )}
    </section>
  )
}
