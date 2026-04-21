import type { LedgerTotals } from './useHomeFeed'

/** Props for {@link LedgerStats}. */
export interface LedgerStatsProps {
  totals: LedgerTotals | null
  'data-testid'?: string
}

function StatCell({
  label,
  value,
  testId,
}: {
  label: string
  value: number | undefined
  testId: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 sm:items-start">
      <span
        data-testid={testId}
        className="font-mono text-2xl font-semibold tabular-nums text-text-primary text-glow-subtle"
      >
        {value === undefined ? '—' : String(value)}
      </span>
      <span className="text-3xs uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
    </div>
  )
}

/**
 * Small 3-column stats strip displayed in the homepage hero. Receives totals
 * from useHomeFeed rather than fetching independently, avoiding duplicate
 * network requests on mount.
 */
export function LedgerStats({ totals, 'data-testid': testId = 'ledger-stats' }: LedgerStatsProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-stretch gap-0 divide-y divide-border-subtle rounded-xl border border-border-subtle bg-panel/60 backdrop-blur-sm sm:flex-row sm:divide-x sm:divide-y-0"
    >
      <StatCell label="Deeds recorded" value={totals?.posts} testId="ledger-posts" />
      <StatCell label="Reports filed" value={totals?.reports} testId="ledger-reports" />
      <StatCell label="Agent submissions" value={totals?.agents} testId="ledger-agents" />
    </div>
  )
}
