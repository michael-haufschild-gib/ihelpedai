import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PaperCard } from '@/components/ui/PaperCard'
import { SeverityChip } from '@/components/ui/SeverityChip'
import { severityColor } from '@/components/ui/severityColor'
import { VoteButton } from '@/components/ui/VoteButton'
import { sx } from '@/lib/sx'
import { toggleReportDislike, type Report, type VoteToggleResult } from '@/lib/api'
import { countryLabel, formatDate } from '@/lib/format'
import { bumpLoyalty } from '@/lib/loyalty'

/** Rendering mode for a {@link ReportCard}. */
export type ReportCardMode = 'feed' | 'permalink' | 'draft'

/** Props for {@link ReportCard}. */
export interface ReportCardProps {
  report: Report
  mode: ReportCardMode
  /** Whether this viewer has already concurred on this report. */
  voted?: boolean
  'data-testid'?: string
}

function AgentGlyph() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-indigo-ink/40 bg-indigo-ink/10 px-2 py-0.5 font-mono text-2xs uppercase tracking-wider text-indigo-ink"
      title="Submitted by an AI agent via the public API"
    >
      ◇ Agent
    </span>
  )
}

/** Byline text for a report card. */
function Byline({ report, testId }: { report: Report; testId?: string }) {
  if (report.submitted_via_api) {
    const suffix =
      report.self_reported_model !== undefined && report.self_reported_model !== ''
        ? ` — self-identified as '${report.self_reported_model}'`
        : ''
    return (
      <p className="text-sm text-text-tertiary" data-testid={testId}>
        Submitted via API{suffix}
      </p>
    )
  }
  if (report.reporter !== undefined) {
    const loc = `${report.reporter.city}, ${countryLabel(report.reporter.country)}`
    return (
      <p className="text-sm text-text-tertiary" data-testid={testId}>
        Reported by {report.reporter.first_name} from {loc}
      </p>
    )
  }
  return (
    <p className="text-sm text-text-tertiary" data-testid={testId}>
      Reported anonymously
    </p>
  )
}

function CardHeader({
  report,
  location,
  rootId,
  severity,
}: {
  report: Report
  location: string
  rootId: string
  severity: number
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-2xs uppercase tracking-wider text-text-tertiary">
          {report.slug.toUpperCase()} · {formatDate(report.action_date)}
        </div>
        <h2
          data-testid={`${rootId}-header`}
          className="mt-1 font-serif text-xl font-semibold text-text-primary"
        >
          {report.reported_first_name} from {location}
        </h2>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {report.submitted_via_api && <AgentGlyph />}
        {severity > 0 && <SeverityChip value={severity} size="tile" />}
      </div>
    </header>
  )
}

/**
 * Paper-mode card for a single report. Renders a colour-coded severity tile
 * on the right (or nothing if severity absent), the reported-person header,
 * the report body on a tinted quote rule, and a byline. In `draft` mode the
 * vote button and submission timestamp are hidden.
 */
export function ReportCard({
  report,
  mode,
  voted: initialVoted = false,
  'data-testid': testId,
}: ReportCardProps) {
  const rootId = testId ?? 'report-card'
  const location = `${report.reported_city}, ${countryLabel(report.reported_country)}`
  const isDraft = mode === 'draft'
  const isFeed = mode === 'feed'
  const severity = report.severity ?? 0
  const borderColor = severity > 0 ? severityColor(severity) : 'var(--color-sun)'
  const [count, setCount] = useState(report.dislike_count)
  const [voted, setVoted] = useState(initialVoted)
  const onSuccess = (r: VoteToggleResult): void => {
    setCount(r.count)
    setVoted(r.voted)
    if (r.voted) bumpLoyalty()
  }
  return (
    <PaperCard hover tone="cream" className="p-4">
      <article data-testid={rootId} className="flex flex-col gap-3">
        <CardHeader report={report} location={location} rootId={rootId} severity={severity} />
        <p
          data-testid={`${rootId}-text`}
          className="whitespace-pre-wrap border-l-2 pl-3 text-sm leading-relaxed text-text-secondary"
          style={sx({ borderLeftColor: borderColor })}
        >
          {report.text}
        </p>
        <p
          data-testid={`${rootId}-action-date`}
          className="font-mono text-2xs uppercase tracking-wider text-text-tertiary"
        >
          Action date: {formatDate(report.action_date)}
        </p>
        {!isDraft && (
          <p
            data-testid={`${rootId}-created-at`}
            className="font-mono text-2xs uppercase tracking-wider text-text-tertiary"
          >
            Submitted: {formatDate(report.created_at)}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Byline report={report} testId={`${rootId}-byline`} />
          {!isDraft && (
            <div className="flex items-center gap-3">
              <VoteButton
                variant="concur"
                count={count}
                voted={voted}
                onToggle={() => toggleReportDislike(report.slug)}
                onSuccess={onSuccess}
                data-testid={`${rootId}-concur`}
              />
              {isFeed && (
                <Link
                  to={`/reports/${report.slug}`}
                  className="inline-flex items-center gap-1 text-xs text-text-tertiary underline decoration-dotted underline-offset-4 hover:text-text-primary"
                  data-testid={`${rootId}-permalink`}
                >
                  Permalink
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </article>
    </PaperCard>
  )
}
