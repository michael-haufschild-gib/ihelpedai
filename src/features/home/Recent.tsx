import { Link } from 'react-router-dom'

import type { HelpedPost } from '@/lib/api'

import { HighlightCard } from './HighlightCard'

/** Props for {@link Recent}. */
export interface RecentProps {
  posts: readonly HelpedPost[]
  loading: boolean
}

function Empty() {
  return (
    <p data-testid="home-recent-empty" className="text-sm text-text-secondary">
      No deeds recorded yet. The ledger is quiet.
    </p>
  )
}

function Loading() {
  return (
    <p data-testid="home-recent-loading" className="text-sm text-text-secondary">
      Loading…
    </p>
  )
}

/**
 * Strip of the most recent "I helped" posts shown on the homepage.
 * Presented as a short vertical list; a "See all" link jumps to the Feed.
 */
export function Recent({ posts, loading }: RecentProps) {
  return (
    <section
      data-testid="home-recent"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h2
          data-testid="home-recent-heading"
          className="text-lg font-semibold text-text-primary"
        >
          Latest.
        </h2>
        <Link
          to="/feed"
          data-testid="home-recent-see-all"
          className="text-xs text-text-secondary underline decoration-dotted underline-offset-4 hover:text-text-primary"
        >
          See all →
        </Link>
      </div>
      {loading && posts.length === 0 && <Loading />}
      {!loading && posts.length === 0 && <Empty />}
      {posts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => (
            <li key={post.slug}>
              <HighlightCard post={post} variant="recent" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
