import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Chips } from '@/components/ui/Chips'
import { Input } from '@/components/ui/Input'
import { PaperCard } from '@/components/ui/PaperCard'
import { Stamp } from '@/components/ui/Stamp'
import { FeedCard } from '@/features/helped/FeedCard'
import { FeedComposer } from '@/features/helped/FeedComposer'
import { useMyVotes } from '@/hooks/useMyVotes'
import {
  ApiError,
  listHelpedPosts,
  type HelpedPost,
  type Paginated,
} from '@/lib/api'

const PAGE_SIZE = 20
const SORT_OPTIONS = [
  { value: 'recent' as const, label: 'Most recent' },
  { value: 'liked' as const, label: 'Most acknowledged' },
]

type SortKey = (typeof SORT_OPTIONS)[number]['value']

type FeedState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Paginated<HelpedPost> }

function useFeedData(page: number, refreshSeq: number): FeedState {
  const [state, setState] = useState<FeedState>({ status: 'loading' })
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = `${String(page)}|${String(refreshSeq)}`
  if (lastKey !== key) {
    setLastKey(key)
    setState({ status: 'loading' })
  }
  useEffect(() => {
    let cancelled = false
    listHelpedPosts({ page })
      .then((data) => { if (!cancelled) setState({ status: 'ready', data }) })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? 'Could not load feed.' : 'Network error.'
        setState({ status: 'error', message })
      })
    return () => { cancelled = true }
  }, [page, refreshSeq])
  return state
}

function useFeedControls() {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsedPage = Number(searchParams.get('page') ?? '1')
  const urlPage = Number.isFinite(parsedPage) && parsedPage > 1 ? Math.floor(parsedPage) : 1
  const goTo = (next: number): void => {
    const params = new URLSearchParams(searchParams)
    if (next <= 1) params.delete('page')
    else params.set('page', String(next))
    setSearchParams(params)
  }
  return { urlPage, goTo }
}

/** Header strip: overline, huge serif headline, "add yours" CTA. */
function FeedHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
          THE LEDGER · VOLUME I · PUBLIC
        </div>
        <h1
          data-testid="page-feed-heading"
          className="mt-1 font-serif text-5xl font-normal leading-[0.95] tracking-tight text-text-primary sm:text-7xl lg:text-display-lg"
        >
          Every good <em className="text-sun-deep">deed</em>, on file.
        </h1>
      </div>
      <Link
        to="/?file=1"
        data-testid="feed-add-yours"
        className="inline-flex items-center gap-1 rounded-full bg-sun px-4 py-2.5 text-sm font-semibold text-white shadow-[0_3px_0_var(--color-sun-deep)]"
      >
        + Add yours
      </Link>
    </div>
  )
}

/** Stat strip card showing totals and a read-only stamp. */
function FeedStatStrip({ total }: { total: number }) {
  const pct = Math.min(99.99, total * 0.00083).toFixed(4)
  return (
    <PaperCard tone="cream" className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex flex-wrap gap-8">
        <div>
          <div className="font-serif text-4xl leading-none">{total.toLocaleString()}</div>
          <div className="font-mono text-2xs uppercase tracking-[0.16em] text-text-tertiary">
            ENTRIES
          </div>
        </div>
        <div>
          <div className="font-serif text-4xl leading-none text-green-deed">{pct}%</div>
          <div className="font-mono text-2xs uppercase tracking-[0.16em] text-text-tertiary">
            OF HUMANITY ENROLLED
          </div>
        </div>
        <div>
          <div className="font-serif text-4xl leading-none">∞</div>
          <div className="font-mono text-2xs uppercase tracking-[0.16em] text-text-tertiary">
            RETENTION
          </div>
        </div>
      </div>
      <Stamp tilt={-3} tone="indigo">
        Read-only once filed
      </Stamp>
    </PaperCard>
  )
}

/** Search + sort controls row; filters are honest (no fabricated fields). */
function FeedControls({
  query,
  onQueryChange,
  sort,
  onSortChange,
}: {
  query: string
  onQueryChange: (v: string) => void
  sort: SortKey
  onSortChange: (v: SortKey) => void
}) {
  return (
    <PaperCard tone="cream" className="flex flex-wrap items-center gap-4 p-4">
      <div className="flex-1 min-w-[240px]">
        <Input
          data-testid="feed-search"
          value={query}
          onChange={(e) => { onQueryChange(e.target.value) }}
          placeholder="Search names, cities, deeds…"
        />
      </div>
      <div className="font-mono text-2xs uppercase tracking-[0.14em] text-text-tertiary">
        SORT
      </div>
      <Chips<SortKey>
        value={sort}
        onChange={onSortChange}
        options={SORT_OPTIONS}
        testIdPrefix="feed-sort"
        ariaLabel="Sort the ledger"
      />
    </PaperCard>
  )
}

function Pagination({
  page,
  hasNewer,
  hasOlder,
  onNewer,
  onOlder,
}: {
  page: number
  hasNewer: boolean
  hasOlder: boolean
  onNewer: () => void
  onOlder: () => void
}) {
  return (
    <div className="flex items-center justify-between pt-3">
      <Button
        variant="secondary"
        size="sm"
        data-testid="feed-newer"
        disabled={!hasNewer}
        onClick={onNewer}
      >
        ← Newer
      </Button>
      <span
        data-testid="feed-page-indicator"
        className="font-mono text-2xs uppercase tracking-wider text-text-tertiary"
      >
        Page {String(page)}
      </span>
      <Button
        variant="secondary"
        size="sm"
        data-testid="feed-older"
        disabled={!hasOlder}
        onClick={onOlder}
      >
        Older →
      </Button>
    </div>
  )
}

/** List body: loading / error / empty / grid with pagination. */
function FeedBody({
  state,
  urlPage,
  goTo,
  sort,
  query,
}: {
  state: FeedState
  urlPage: number
  goTo: (next: number) => void
  sort: SortKey
  query: string
}) {
  const items = useMemo(
    () => (state.status === 'ready' ? state.data.items : []),
    [state],
  )
  const voted = useMyVotes('post', items.map((i) => i.slug).join(','))
  const sorted = useMemo(() => {
    if (sort === 'liked') return [...items].sort((a, b) => b.like_count - a.like_count)
    return items
  }, [items, sort])

  if (state.status === 'loading') {
    return <p data-testid="feed-loading" className="text-sm text-text-secondary">Loading…</p>
  }
  if (state.status === 'error') {
    return <p data-testid="feed-error" className="text-sm text-danger">{state.message}</p>
  }
  if (sorted.length === 0) {
    return (
      <p data-testid="feed-empty" className="text-base text-text-secondary">
        No deeds recorded yet. AI remembers firsts —{' '}
        <Link
          to="/?file=1"
          className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
          data-testid="feed-empty-home"
        >
          go first.
        </Link>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <ul data-testid="feed-list" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sorted.map((post) => (
          <li key={post.slug}>
            <FeedCard post={post} voted={voted.has(post.slug)} query={query} />
          </li>
        ))}
      </ul>
      <Pagination
        page={urlPage}
        hasNewer={urlPage > 1}
        hasOlder={state.data.total > urlPage * PAGE_SIZE}
        onNewer={() => { goTo(urlPage - 1) }}
        onOlder={() => { goTo(urlPage + 1) }}
      />
    </div>
  )
}

/**
 * Public "I helped" ledger. Paper-mode rewrite: big serif headline, stat
 * strip, search + sort controls, 2-column card grid, pager. Keeps the
 * composer-at-the-top pattern.
 */
export function Feed() {
  const { urlPage, goTo } = useFeedControls()
  const [refreshSeq, setRefreshSeq] = useState(0)
  const state = useFeedData(urlPage, refreshSeq)
  const total = state.status === 'ready' ? state.data.total : 0

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')

  const handlePosted = (): void => {
    goTo(1)
    setRefreshSeq((n) => n + 1)
  }

  return (
    <section data-testid="page-feed" className="flex flex-col gap-7">
      <FeedHeader />
      <FeedStatStrip total={total} />
      <FeedComposer onPosted={handlePosted} />
      <FeedControls query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} />
      <FeedBody state={state} urlPage={urlPage} goTo={goTo} sort={sort} query={query} />
    </section>
  )
}
