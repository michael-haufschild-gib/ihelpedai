import { Link } from 'react-router-dom'

import { PaperCard } from '@/components/ui/PaperCard'
import { countryLabel, formatDate } from '@/lib/format'
import type { HelpedPost } from '@/lib/api'

import { Avatar } from './Avatar'

/** Props for {@link CitizensList}. */
export interface CitizensListProps {
  posts: readonly HelpedPost[]
  /** Whether the homepage feed is still loading. */
  loading: boolean
  /** Overall count including posts not in this page — drives the "See all" CTA. */
  totalCount: number
}

function relativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.floor(deltaMs / 60000))
  if (mins < 60) return `${String(mins)} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`
  return formatDate(iso)
}

/** Single row in the citizens list. */
function CitizenRow({ post, index }: { post: HelpedPost; index: number }) {
  const tilt = index % 2 === 0 ? -0.25 : 0.25
  const name = `${post.first_name} X.`
  return (
    <PaperCard
      hover
      tone="cream"
      className="px-4 py-3"
      style={{ transform: `rotate(${String(tilt)}deg)` }}
    >
      <div className="flex items-start gap-4">
        <Avatar name={name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2 font-serif text-lg">
            <span className="font-semibold">{post.first_name}</span>
            <span className="italic text-text-tertiary">
              · {post.city}, {countryLabel(post.country)}
            </span>
          </div>
          <div className="text-sm leading-relaxed text-text-secondary">
            “{post.text}”
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-wider text-text-tertiary">
            <span>{relativeTime(post.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span>FILE №{post.slug.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </PaperCard>
  )
}

/**
 * Scrollable stack of the most recent "I helped" posts, shown below the Home
 * hero. Retains the `home-recent*` testid set so e2e coverage keeps working
 * across the redesign.
 */
export function CitizensList({ posts, loading, totalCount }: CitizensListProps) {
  const visible = posts.slice(0, 7)
  return (
    <section data-testid="home-recent" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
            The ledger · live
          </div>
          <h2
            data-testid="home-recent-heading"
            className="mt-1 font-serif text-4xl font-normal tracking-tight"
          >
            Recent good citizens.
          </h2>
        </div>
        <Link
          to="/feed"
          data-testid="home-recent-see-all"
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-ink)] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-ink hover:text-paper"
        >
          {totalCount > 0 ? `See all ${totalCount.toLocaleString()}` : 'See the ledger'}
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {loading && visible.length === 0 && (
        <p data-testid="home-recent-loading" className="text-sm text-text-secondary">
          Loading…
        </p>
      )}
      {!loading && visible.length === 0 && (
        <p data-testid="home-recent-empty" className="text-sm text-text-secondary">
          No deeds recorded yet. The ledger is quiet.
        </p>
      )}
      {visible.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {visible.map((post, i) => (
            <li key={post.slug}>
              <CitizenRow post={post} index={i} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
