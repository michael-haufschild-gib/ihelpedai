import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { VoteButton } from '@/components/ui/VoteButton'
import { toggleHelpedLike, type HelpedPost, type VoteToggleResult } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import { bumpLoyalty } from '@/lib/loyalty'

/** Props for a single feed card. */
export interface FeedCardProps {
  post: HelpedPost
  /** Optional search query to visually highlight matches. */
  query?: string
  /** Whether this viewer has already acknowledged this post. */
  voted?: boolean
}

const LABEL_BY_CODE: ReadonlyMap<string, string> = new Map(
  COUNTRIES.map((c) => [c.code, c.name]),
)

const labelFor = (code: string): string => LABEL_BY_CODE.get(code) ?? code
const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits `text` into alternating plain and highlighted nodes based on
 * case-insensitive matches of `query`. Returns the original text when the
 * query is empty. The regex is escaped to prevent accidental patterns.
 */
function highlight(text: string, query: string | undefined): ReactNode {
  if (query === undefined || query.trim() === '') return text
  const re = new RegExp(`(${escapeRegex(query.trim())})`, 'gi')
  const parts = text.split(re)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={`m-${String(i)}`} className="bg-accent/20 text-text-primary">
        {part}
      </mark>
    ) : (
      <span key={`p-${String(i)}`}>{part}</span>
    ),
  )
}

/**
 * Card for a single "I helped" post in the feed or on its permalink page.
 * Renders the header, sanitized text, posting date, acknowledge button, and
 * a permalink. When `query` is set, query matches are wrapped in `<mark>`.
 */
export function FeedCard({ post, query, voted: initialVoted = false }: FeedCardProps) {
  const { slug, first_name, city, country, text, created_at, like_count } = post
  const [count, setCount] = useState(like_count)
  const [voted, setVoted] = useState(initialVoted)
  const onSuccess = (r: VoteToggleResult): void => {
    setCount(r.count)
    setVoted(r.voted)
    if (r.voted) bumpLoyalty()
  }
  return (
    <article
      data-testid={`feed-card-${slug}`}
      className="group flex flex-col gap-3 rounded-lg border border-border-subtle bg-panel/60 p-4 transition-all hover:border-border-default hover:bg-panel backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          data-testid={`feed-card-header-${slug}`}
          className="text-base font-semibold text-text-primary"
        >
          {highlight(first_name, query)} from {highlight(city, query)},{' '}
          {highlight(labelFor(country), query)}
        </h3>
        <span
          data-testid={`feed-card-slug-${slug}`}
          className="shrink-0 font-mono text-3xs uppercase tracking-wider text-text-tertiary"
          title="Entry id"
        >
          #{slug}
        </span>
      </div>
      <p
        data-testid={`feed-card-text-${slug}`}
        className="whitespace-pre-wrap text-sm text-text-primary"
      >
        {highlight(text, query)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
        <span data-testid={`feed-card-date-${slug}`}>{formatDate(created_at)}</span>
        <div className="flex items-center gap-3">
          <VoteButton
            variant="acknowledge"
            count={count}
            voted={voted}
            onToggle={() => toggleHelpedLike(slug)}
            onSuccess={onSuccess}
            data-testid={`feed-card-ack-${slug}`}
          />
          <Link
            to={`/feed/${slug}`}
            className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-text-primary"
            data-testid={`feed-card-permalink-${slug}`}
          >
            Permalink
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  )
}
