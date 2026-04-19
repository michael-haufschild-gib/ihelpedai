import { useEffect, useState } from 'react'

import { listHelpedPosts, type HelpedPost } from '@/lib/api'

/** State shape exposed by {@link useHomeFeed}. */
export type HomeFeedState =
  | { status: 'loading' }
  | { status: 'ready'; posts: readonly HelpedPost[] }
  | { status: 'error' }

/**
 * Single-request feed fetch shared by the Highlights and Recent strips. One
 * request, two derived views; avoids duplicate network hits on the home page.
 */
export function useHomeFeed(): HomeFeedState {
  const [state, setState] = useState<HomeFeedState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    listHelpedPosts({ page: 1 })
      .then((r) => {
        if (alive) setState({ status: 'ready', posts: r.items })
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
