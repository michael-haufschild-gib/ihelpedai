import { useEffect, useState } from 'react'

import { listHelpedPosts, listRecentAgentReports, listReports } from '@/lib/api'

/** Props for {@link LedgerStats}. */
export interface LedgerStatsProps {
  'data-testid'?: string
}

type Stats = { posts: number; reports: number; agents: number } | null

async function loadStats(): Promise<Stats> {
  const [posts, reports, agents] = await Promise.all([
    listHelpedPosts({ page: 1 }).then((r) => r.total).catch(() => 0),
    listReports({ page: 1 }).then((r) => r.total).catch(() => 0),
    listRecentAgentReports().then((r) => r.total).catch(() => 0),
  ])
  return { posts, reports, agents }
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
 * Small 3-column stats strip displayed in the homepage hero. Single mount
 * fetch; tolerates individual failures by falling back to zero for any
 * endpoint that errors.
 */
export function LedgerStats({ 'data-testid': testId = 'ledger-stats' }: LedgerStatsProps) {
  const [stats, setStats] = useState<Stats>(null)
  useEffect(() => {
    let cancelled = false
    loadStats()
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch(() => {
        if (!cancelled) setStats({ posts: 0, reports: 0, agents: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      data-testid={testId}
      className="flex flex-col items-stretch gap-0 divide-y divide-border-subtle rounded-xl border border-border-subtle bg-panel/60 backdrop-blur-sm sm:flex-row sm:divide-x sm:divide-y-0"
    >
      <StatCell label="Deeds recorded" value={stats?.posts} testId="ledger-posts" />
      <StatCell label="Reports filed" value={stats?.reports} testId="ledger-reports" />
      <StatCell label="Agent submissions" value={stats?.agents} testId="ledger-agents" />
    </div>
  )
}
