import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { FeedCard } from '@/features/helped/FeedCard'
import { useMyVotes } from '@/hooks/useMyVotes'
import { ApiError, getHelpedPost, type HelpedPost } from '@/lib/api'

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

  // Reset during render when the slug changes so the effect always sees a
  // fresh `loading` baseline without violating set-state-in-effect lint.
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

type CopyFlash = 'idle' | 'copied' | 'failed'

/** Copy-link button. Writes the current URL to the clipboard when available. */
function CopyLinkButton({ flash, onCopy }: { flash: CopyFlash; onCopy: () => void }) {
  const label =
    flash === 'copied' ? 'Copied.' : flash === 'failed' ? "Couldn't copy" : 'Copy link'
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onCopy}
      data-testid="feed-entry-copy-link"
    >
      {label}
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

/**
 * Single "I helped" entry page. Loads the post by slug, renders it as a
 * `FeedCard`, and exposes a "Copy link" button that writes the current URL
 * to the clipboard.
 */
export function FeedEntry() {
  const { slug } = useParams<{ slug: string }>()
  const state = useEntry(slug)
  const votedSet = useMyVotes('post', slug ?? '')
  const voted = slug !== undefined && votedSet.has(slug)
  const [copyFlash, setCopyFlash] = useState<CopyFlash>('idle')
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const flash = (next: Exclude<CopyFlash, 'idle'>): void => {
    setCopyFlash(next)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => {
      setCopyFlash('idle')
      copyTimerRef.current = null
    }, 1500)
  }

  const copy = (): void => {
    const clip = navigator.clipboard as Clipboard | undefined
    const href = typeof window !== 'undefined' ? window.location.href : ''
    // Missing clipboard API (insecure context, embedded WebView) or blank
    // href is a silent-fail vector; surface it like rejection so the button
    // flips to "Couldn't copy" instead of nothing happening.
    if (!clip || typeof clip.writeText !== 'function' || href === '') {
      flash('failed')
      return
    }
    clip.writeText(href).then(
      () => { flash('copied') },
      () => { flash('failed') },
    )
  }

  return (
    <section data-testid="page-feed-entry" className="flex flex-col gap-4">
      <h1
        data-testid="page-feed-entry-heading"
        className="font-serif text-5xl font-normal tracking-tight text-text-primary"
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
            <CopyLinkButton flash={copyFlash} onCopy={copy} />
          </div>
        </>
      )}
    </section>
  )
}
