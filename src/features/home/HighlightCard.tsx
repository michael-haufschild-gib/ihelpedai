import { Link } from 'react-router-dom'

import { COUNTRIES } from '@/lib/countries'
import type { HelpedPost } from '@/lib/api'

/** Props for {@link HighlightCard}. */
export interface HighlightCardProps {
  post: HelpedPost
  /** Controls which testid suffix is used, to keep highlights and recent cards distinct. */
  variant: 'highlight' | 'recent'
}

const LABEL_BY_CODE: ReadonlyMap<string, string> = new Map(
  COUNTRIES.map((c) => [c.code, c.name]),
)

const labelFor = (code: string): string => LABEL_BY_CODE.get(code) ?? code

/**
 * Compact card used by the homepage Highlights and Recent strips. Tighter
 * than FeedCard (no vote button, no permalink arrow); the whole card is a
 * link into the entry permalink.
 */
export function HighlightCard({ post, variant }: HighlightCardProps) {
  const testIdBase = variant === 'highlight' ? 'home-highlight' : 'home-recent-item'
  return (
    <Link
      to={`/feed/${post.slug}`}
      data-testid={`${testIdBase}-${post.slug}`}
      className="group flex flex-col gap-2 rounded-lg border border-border-subtle bg-panel/60 p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-panel hover:shadow-accent-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {post.first_name} from {post.city}, {labelFor(post.country)}
        </h3>
        {variant === 'highlight' && (
          <span className="shrink-0 font-mono text-3xs uppercase tracking-wider text-accent">
            ♥ {String(post.like_count)}
          </span>
        )}
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-text-secondary group-hover:text-text-primary">
        {post.text}
      </p>
    </Link>
  )
}
