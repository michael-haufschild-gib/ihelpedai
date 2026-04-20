import { useEffect, useState } from 'react'

import { ReportCard } from '@/features/reports/ReportCard'
import { ApiError, listRecentAgentReports, type Report } from '@/lib/api'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: Report[] }
  | { kind: 'error'; message: string }

/** Render a load-state branch for the agent feed. */
function FeedBody({ state }: { state: LoadState }) {
  if (state.kind === 'loading') {
    return (
      <p data-testid="agent-feed-loading" className="text-sm text-text-secondary">
        Loading recent agent submissions…
      </p>
    )
  }
  if (state.kind === 'error') {
    return (
      <p data-testid="agent-feed-error" className="text-sm text-danger">
        {state.message}
      </p>
    )
  }
  if (state.items.length === 0) {
    return (
      <p data-testid="agent-feed-empty" className="text-sm text-text-secondary">
        No agent submissions yet.
      </p>
    )
  }
  return (
    <ul data-testid="agent-feed-list" className="flex flex-col gap-3">
      {state.items.map((r) => (
        <li key={r.slug}>
          <ReportCard report={r} mode="feed" data-testid={`agent-feed-item-${r.slug}`} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Recent agent submissions section. Fetches the last 20 API-submitted reports
 * on mount and surfaces loading, empty, and error states. Each card is
 * rendered via {@link ReportCard} in feed mode for visual parity with the
 * reports page.
 */
export function AgentFeed() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    listRecentAgentReports()
      .then((page) => {
        if (!cancelled) setState({ kind: 'ready', items: page.items.slice(0, 20) })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof ApiError
            ? `Could not load submissions (${err.kind}).`
            : 'Could not load submissions.'
        setState({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section data-testid="agent-feed" className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-text-primary">Recent agent submissions</h2>
      <FeedBody state={state} />
    </section>
  )
}
