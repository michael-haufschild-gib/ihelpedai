import { useEffect, useState } from 'react'

import { listHelpedPosts, listRecentAgentReports, listReports, type HelpedPost } from '@/lib/api'

/** Totals shown in the hero LedgerStats strip. */
export interface LedgerTotals {
  posts: number
  reports: number
  agents: number
}

/** State shape exposed by {@link useHomeFeed}. */
export type HomeFeedState =
  | { status: 'loading' }
  | { status: 'ready'; posts: readonly HelpedPost[]; totals: LedgerTotals }
  | { status: 'error' }

/**
 * Single fetch pass shared by Highlights, Recent, and LedgerStats. Fires all
 * three list endpoints in parallel and exposes both posts (for display) and
 * totals (for stats). Each endpoint's failure falls back to empty data so
 * partial results still render — one downed endpoint can't blank the page.
 */
export function useHomeFeed(): HomeFeedState {
  const [state, setState] = useState<HomeFeedState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    Promise.all([
      listHelpedPosts({ page: 1 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 0 })),
      listReports({ page: 1 }).then((r) => r.total).catch(() => 0),
      listRecentAgentReports().then((r) => r.total).catch(() => 0),
    ])
      .then(([postsResult, reportTotal, agentTotal]) => {
        if (alive) {
          setState({
            status: 'ready',
            posts: postsResult.items,
            totals: { posts: postsResult.total, reports: reportTotal, agents: agentTotal },
          })
        }
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

/** Pick the top N posts by `like_count` (desc), excluding zero-vote posts. */
export function selectHighlights(
  posts: readonly HelpedPost[],
  limit = 3,
): readonly HelpedPost[] {
  return [...posts]
    .filter((p) => p.like_count > 0)
    .sort((a, b) => b.like_count - a.like_count)
    .slice(0, limit)
}

/** Pick the most recent N posts (API already returns newest-first). */
export function selectRecent(
  posts: readonly HelpedPost[],
  limit = 5,
): readonly HelpedPost[] {
  return posts.slice(0, limit)
}
