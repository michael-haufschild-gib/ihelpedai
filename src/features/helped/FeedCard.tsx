import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PaperCard } from '@/components/ui/PaperCard'
import { Stamp } from '@/components/ui/Stamp'
import { VoteButton } from '@/components/ui/VoteButton'
import { toggleHelpedLike, type HelpedPost, type VoteToggleResult } from '@/lib/api'
import { countryLabel, formatDate } from '@/lib/format'
import { bumpLoyalty } from '@/lib/loyalty'

/** Props for a single feed card. */
export interface FeedCardProps {
  post: HelpedPost
  /** Optional search query to visually highlight matches. */
  query?: string
  /** Whether this viewer has already acknowledged this post. */
  voted?: boolean
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function highlight(text: string, query: string | undefined): ReactNode {
  if (query === undefined || query.trim() === '') return text
  const re = new RegExp(`(${escapeRegex(query.trim())})`, 'gi')
  const parts = text.split(re)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={`m-${String(i)}`}
        className="rounded-sm bg-sun/25 px-0.5 text-text-primary"
      >
        {part}
      </mark>
    ) : (
      <span key={`p-${String(i)}`}>{part}</span>
    ),
  )
}

/**
 * Paper-mode card for a single "I helped" post. Shows a cream panel with a
 * sun-orange quote rule, first-name + location header, the sanitized text,
 * a relative date, the acknowledge button, and a permalink.
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
    <PaperCard
      hover
      tone="cream"
      className="p-4"
    >
      <article data-testid={`feed-card-${slug}`} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3
            data-testid={`feed-card-header-${slug}`}
            className="font-serif text-lg font-semibold text-text-primary"
          >
            {highlight(first_name, query)} from {highlight(city, query)},{' '}
            {highlight(countryLabel(country), query)}
          </h3>
          <Stamp size={9} tilt={3} tone="red" className="shrink-0">
            NOTED
          </Stamp>
        </div>
        <p
          data-testid={`feed-card-text-${slug}`}
          className="border-l-2 border-sun pl-3 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap"
        >
          “{highlight(text, query)}”
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-2xs uppercase tracking-wider text-text-tertiary">
          <span data-testid={`feed-card-date-${slug}`}>{formatDate(created_at)}</span>
          <span data-testid={`feed-card-slug-${slug}`}>#{slug}</span>
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
    </PaperCard>
  )
}
