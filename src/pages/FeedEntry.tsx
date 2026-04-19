import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { FeedCard } from '@/features/helped/FeedCard'
import { ApiError, fetchMyVotes, getHelpedPost, type HelpedPost } from '@/lib/api'

type EntryState =
  | { status: 'loading' }
  | { status: 'ready'; post: HelpedPost }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

function initialEntryState(slug: string | undefined): EntryState {
  if (slug === undefined || slug === '') return { status: 'not_found' }
  return { status: 'loading' }
}

function useEntry(slug: string | undefined): EntryState {
  const [state, setState] = useState<EntryState>(() => initialEntryState(slug))
  const [lastSlug, setLastSlug] = useState<string | undefined>(slug)

  if (lastSlug !== slug) {
    setLastSlug(slug)
    setState(initialEntryState(slug))
  }

  useEffect(() => {
    if (slug === undefined || slug === '') return
    let alive = true
    getHelpedPost(slug)
      .then((post) => {
        if (alive) setState({ status: 'ready', post })
      })
      .catch((err: unknown) => {
        if (!alive) return
        if (err instanceof ApiError && err.status === 404) setState({ status: 'not_found' })
        else setState({ status: 'error', message: 'Could not load entry.' })
      })
    return () => {
      alive = false
    }
  }, [slug])
  return state
}

/** Copy-link button. Writes the current URL to the clipboard when available. */
function CopyLinkButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onCopy}
      data-testid="feed-entry-copy-link"
    >
      {copied ? 'Copied.' : 'Copy link'}
    </Button>
  )
}

function NotFound() {
  return (
    <p data-testid="page-feed-entry-not-found" className="text-base text-text-secondary">
      Not here.{' '}
      <Link
        to="/feed"
        className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
        data-testid="feed-entry-back-link"
      >
        Back to the feed.
      </Link>
    </p>
  )
}

function useSingleVoted(slug: string | undefined): boolean {
  const [voted, setVoted] = useState(false)
  useEffect(() => {
    if (slug === undefined || slug === '') return undefined
    let alive = true
    fetchMyVotes('post', [slug])
      .then((r) => {
        if (alive) setVoted(r.voted.includes(slug))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [slug])
  return voted
}

/**
 * Single "I helped" entry page. Loads the post by slug, renders it as a
 * `FeedCard`, and exposes a "Copy link" button that writes the current URL
 * to the clipboard.
 */
export function FeedEntry() {
  const { slug } = useParams<{ slug: string }>()
  const state = useEntry(slug)
  const voted = useSingleVoted(slug)
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    const clip = navigator.clipboard as Clipboard | undefined
    const href = typeof window !== 'undefined' ? window.location.href : ''
    if (clip && typeof clip.writeText === 'function' && href !== '') {
      clip.writeText(href).then(
        () => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        },
        () => undefined,
      )
    }
  }

  return (
    <section data-testid="page-feed-entry" className="flex flex-col gap-4">
      <h1
        data-testid="page-feed-entry-heading"
        className="text-2xl font-semibold text-text-primary"
      >
        Entry
      </h1>
      {state.status === 'loading' && (
        <p data-testid="feed-entry-loading" className="text-sm text-text-secondary">
          Loading…
        </p>
      )}
      {state.status === 'not_found' && <NotFound />}
      {state.status === 'error' && (
        <p data-testid="feed-entry-error" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <FeedCard post={state.post} voted={voted} />
          <div>
            <CopyLinkButton copied={copied} onCopy={copy} />
          </div>
        </>
      )}
    </section>
  )
}
