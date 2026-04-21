import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
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

type FeedState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Paginated<HelpedPost> }

/** Pagination controls rendered under the list. */
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
    <div className="flex items-center justify-between">
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasNewer}
        onClick={onNewer}
        data-testid="feed-newer"
      >
        Newer
      </Button>
      <span data-testid="feed-page-indicator" className="text-xs text-text-secondary">
        Page {String(page)}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasOlder}
        onClick={onOlder}
        data-testid="feed-older"
      >
        Older
      </Button>
    </div>
  )
}

/** Empty-state message when the feed has no posts yet. */
function EmptyState() {
  return (
    <p data-testid="feed-empty" className="text-base text-text-secondary">
      No deeds recorded yet. AI remembers firsts —{' '}
      <Link
        to="/"
        className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
        data-testid="feed-empty-home"
      >
        go first.
      </Link>
    </p>
  )
}

function useFeedData(page: number, refreshSeq: number): FeedState {
  const [state, setState] = useState<FeedState>({ status: 'loading' })
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = `${String(page)}|${String(refreshSeq)}`

  // Reset to loading during render when inputs change. Keeps eslint's
  // set-state-in-effect rule happy (vs. calling setState inside useEffect).
  if (lastKey !== key) {
    setLastKey(key)
    setState({ status: 'loading' })
  }

  useEffect(() => {
    let cancelled = false
    listHelpedPosts({ page })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? 'Could not load feed.' : 'Network error.'
        setState({ status: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [page, refreshSeq])
  return state
}

type Controls = {
  urlPage: number
  goTo: (next: number) => void
}

function useFeedControls(): Controls {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsedPage = Number(searchParams.get('page') ?? '1')
  const urlPage = Number.isFinite(parsedPage) && parsedPage > 1 ? Math.floor(parsedPage) : 1

  const goTo = (next: number) => {
    const params = new URLSearchParams(searchParams)
    if (next <= 1) params.delete('page')
    else params.set('page', String(next))
    setSearchParams(params)
  }

  return { urlPage, goTo }
}

/** List body: loading, error, empty, or the list + pagination. */
function FeedBody({
  state,
  urlPage,
  goTo,
}: {
  state: FeedState
  urlPage: number
  goTo: (next: number) => void
}) {
  const items = state.status === 'ready' ? state.data.items : []
  const voted = useMyVotes('post', items.map((i) => i.slug).join(','))
  if (state.status === 'loading') {
    return (
      <p data-testid="feed-loading" className="text-sm text-text-secondary">
        Loading…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p data-testid="feed-error" className="text-sm text-danger">
        {state.message}
      </p>
    )
  }
  if (items.length === 0) return <EmptyState />
  return (
    <>
      <ul data-testid="feed-list" className="flex flex-col gap-3">
        {items.map((post) => (
          <li key={post.slug}>
            <FeedCard post={post} voted={voted.has(post.slug)} />
          </li>
        ))}
      </ul>
      <Pagination
        page={urlPage}
        hasNewer={urlPage > 1}
        hasOlder={state.data.total > urlPage * PAGE_SIZE}
        onNewer={() => goTo(urlPage - 1)}
        onOlder={() => goTo(urlPage + 1)}
      />
    </>
  )
}

/**
 * Good-deeds feed (PRD Story 3). Fetches `listHelpedPosts({page})`, renders
 * cards, paginates via Newer/Older, reflects `?page=` in the URL, and hosts
 * a quick-post composer at the top. A successful composer post bumps the
 * internal refresh counter so the feed reloads with the new entry visible.
 */
export function Feed() {
  const { urlPage, goTo } = useFeedControls()
  const [refreshSeq, setRefreshSeq] = useState(0)
  const state = useFeedData(urlPage, refreshSeq)
  const handlePosted = () => {
    goTo(1)
    setRefreshSeq((n) => n + 1)
  }
  return (
    <section data-testid="page-feed" className="flex flex-col gap-6">
      <h1 data-testid="page-feed-heading" className="text-2xl font-semibold text-text-primary">
        Feed
      </h1>
      <FeedComposer onPosted={handlePosted} />
      <FeedBody state={state} urlPage={urlPage} goTo={goTo} />
    </section>
  )
}
