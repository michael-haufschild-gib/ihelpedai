import { useEffect, useState } from 'react'

import { listHelpedPosts, listRecentAgentReports, listReports, type HelpedPost } from '@/lib/api'

/**
 * Totals shown in the hero strip. A `null` slot means the corresponding sub-
 * fetch failed — the UI should render that as a neutral placeholder rather
 * than the misleadingly authoritative zero we used to show.
 */
export interface LedgerTotals {
  posts: number | null
  reports: number | null
  agents: number | null
}

/** Per-endpoint partial-failure flags exposed when at least one sub-fetch failed. */
export interface PartialErrors {
  posts: boolean
  reports: boolean
  agents: boolean
}

/** State shape exposed by {@link useHomeFeed}. */
export type HomeFeedState =
  | { status: 'loading' }
  | {
      status: 'ready'
      posts: readonly HelpedPost[]
      totals: LedgerTotals
      partial: PartialErrors
    }
  | { status: 'error' }

const FAILED = Symbol('failed-fetch')
type Failed = typeof FAILED
const isFailed = <T>(value: T | Failed): value is Failed => value === FAILED

/**
 * Single fetch pass for the home page. Fires the three list endpoints in
 * parallel and exposes both posts (for display) and totals (for stats). Each
 * endpoint's failure surfaces in the `partial` flag and renders the affected
 * total as `null` so the UI can show "—" instead of an authoritative zero —
 * one downed endpoint can't make the site read as empty.
 */
export function useHomeFeed(): HomeFeedState {
  const [state, setState] = useState<HomeFeedState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    Promise.all([
      listHelpedPosts({ page: 1 }).catch((): Failed => FAILED),
      listReports({ page: 1 }).catch((): Failed => FAILED),
      listRecentAgentReports().catch((): Failed => FAILED),
    ])
      .then(([postsResult, reportsResult, agentsResult]) => {
        if (!alive) return
        const partial: PartialErrors = {
          posts: isFailed(postsResult),
          reports: isFailed(reportsResult),
          agents: isFailed(agentsResult),
        }
        setState({
          status: 'ready',
          posts: isFailed(postsResult) ? [] : postsResult.items,
          totals: {
            posts: isFailed(postsResult) ? null : postsResult.total,
            reports: isFailed(reportsResult) ? null : reportsResult.total,
            agents: isFailed(agentsResult) ? null : agentsResult.total,
          },
          partial,
        })
      })
      .catch(() => {
        if (alive) setState({ status: 'error' })
      })
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** Pick the most recent N posts (API already returns newest-first). */
export function selectRecent(
  posts: readonly HelpedPost[],
  limit = 5,
): readonly HelpedPost[] {
  return posts.slice(0, limit)
}
