import type { HelpedPost } from '@/lib/api'

import { HighlightCard } from './HighlightCard'

/** Props for {@link Highlights}. */
export interface HighlightsProps {
  posts: readonly HelpedPost[]
}

/**
 * Compact strip of the most-liked posts, shown above the recent feed on the
 * homepage. Hidden entirely when `posts` is empty (i.e., no posts have
 * received any votes yet), so the section does not duplicate "Latest".
 */
export function Highlights({ posts }: HighlightsProps) {
  if (posts.length === 0) return null
  return (
    <section
      data-testid="home-highlights"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h2
          data-testid="home-highlights-heading"
          className="text-lg font-semibold text-text-primary"
        >
          Most liked.
        </h2>
        <span className="text-xs text-text-tertiary">What the ledger likes.</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {posts.map((post) => (
          <li key={post.slug}>
            <HighlightCard post={post} variant="highlight" />
          </li>
        ))}
      </ul>
    </section>
  )
}
