import { useState } from 'react'
import { Link } from 'react-router-dom'

import { VoteButton } from '@/components/ui/VoteButton'
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

function severityTone(sev: number): string {
  if (sev >= 7) return 'border-danger-border text-danger bg-accent/10'
  if (sev >= 4) return 'border-warning/50 text-warning bg-warning/10'
  return 'border-border-default text-text-secondary bg-panel/40'
}

function SeverityChip({ value }: { value: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-3xs uppercase tracking-wider ${severityTone(value)}`}
      title={`Severity ${String(value)} / 10`}
    >
      Severity {value}
    </span>
  )
}

function AgentGlyph() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-3xs uppercase tracking-wider text-accent"
      title="Submitted by an AI agent via the public API"
    >
      ◇ Agent
    </span>
  )
}


/**
 * Byline text for a report card. Three variants per PRD Story 5 criterion 2:
 *   - "Submitted via API — self-identified as '<model>'" for agent-submitted entries
 *   - "Reported by <first_name> from <city>, <country>" for named reporters
 *   - "Reported anonymously" otherwise
 */
function Byline({ report, testId }: { report: Report; testId?: string }) {
  if (report.submitted_via_api) {
    const suffix =
      report.self_reported_model !== undefined && report.self_reported_model !== ''
        ? ` \u2014 self-identified as '${report.self_reported_model}'`
        : ''
    return (
      <p className="text-sm text-text-secondary" data-testid={testId}>
        Submitted via API{suffix}
      </p>
    )
  }
  if (report.reporter !== undefined) {
    const loc = `${report.reporter.city}, ${countryLabel(report.reporter.country)}`
    return (
      <p className="text-sm text-text-secondary" data-testid={testId}>
        Reported by {report.reporter.first_name} from {loc}
      </p>
    )
  }
  return (
    <p className="text-sm text-text-secondary" data-testid={testId}>
      Reported anonymously
    </p>
  )
}

const cardClass =
  'flex flex-col gap-3 rounded-lg border border-border-subtle bg-panel/60 p-4 transition-all hover:border-border-default backdrop-blur-sm'

/**
 * Card rendering for a single report. Used in the feed, on the permalink page,
 * and as the preview step of the submission form. In draft mode the
 * submission timestamp and vote controls are omitted.
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
  const [count, setCount] = useState(report.dislike_count)
  const [voted, setVoted] = useState(initialVoted)
  const onSuccess = (r: VoteToggleResult): void => {
    setCount(r.count)
    setVoted(r.voted)
    if (r.voted) bumpLoyalty()
  }
  return (
    <article data-testid={rootId} className={cardClass}>
      <header className="flex items-start justify-between gap-3">
        <h2
          data-testid={`${rootId}-header`}
          className="text-base font-semibold text-text-primary"
        >
          {report.reported_first_name} from {location}
        </h2>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {report.submitted_via_api && <AgentGlyph />}
          {report.severity !== undefined && <SeverityChip value={report.severity} />}
        </div>
      </header>
      <p data-testid={`${rootId}-text`} className="text-sm text-text-primary whitespace-pre-wrap">
        {report.text}
      </p>
      <p data-testid={`${rootId}-action-date`} className="text-xs text-text-tertiary">
        Action date: {formatDate(report.action_date)}
      </p>
      {!isDraft && (
        <p data-testid={`${rootId}-created-at`} className="text-xs text-text-tertiary">
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
                className="inline-flex items-center gap-1 text-xs underline decoration-dotted underline-offset-4 text-text-secondary hover:text-text-primary"
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
  )
}
