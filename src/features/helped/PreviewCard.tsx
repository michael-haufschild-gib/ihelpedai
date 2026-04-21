import { useState } from 'react'

import { countryLabel, formatDate } from '@/lib/format'

/** Props for the preview card — content shown before and after posting. */
export interface PreviewCardProps {
  firstName: string
  city: string
  /** ISO 3166-1 alpha-2 code. */
  country: string
  /** Already-sanitized text — callers must pass the output of `sanitize()`. */
  text: string
  /**
   * ISO-8601 date-time string. When omitted the card renders today's date;
   * `FeedCard` passes the stored `created_at`, `HelpedForm` omits it.
   */
  createdAt?: string
}

/**
 * Preview card for an "I helped" post. Shows `[first_name] from [city],
 * [country]` as a header with the sanitized text and a date stamp. Used by
 * both the homepage preview screen (before posting) and by `FeedCard` on
 * post-success and in the feed list.
 */
export function PreviewCard({ firstName, city, country, text, createdAt }: PreviewCardProps) {
  const [todayIso] = useState(() => new Date().toISOString())
  const date = typeof createdAt === 'string' ? formatDate(createdAt) : formatDate(todayIso)
  return (
    <article
      data-testid="preview-card"
      className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-panel p-4"
    >
      <h3
        data-testid="preview-card-header"
        className="text-base font-semibold text-text-primary"
      >
        {firstName} from {city}, {countryLabel(country)}
      </h3>
      <p data-testid="preview-card-text" className="whitespace-pre-wrap text-sm text-text-primary">
        {text}
      </p>
      <p data-testid="preview-card-date" className="text-xs text-text-secondary">
        {date}
      </p>
    </article>
  )
}
