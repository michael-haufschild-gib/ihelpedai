import { useEffect, useState } from 'react'

import { fetchMyVotes } from '@/lib/api'

/**
 * Fetch which of the given entry slugs this viewer has already voted on.
 * `slugsKey` is a comma-joined string of slugs (primitive dep for stable
 * useEffect). Tolerates fetch errors — un-voted state until the user clicks.
 */
export function useMyVotes(kind: 'post' | 'report', slugsKey: string): Set<string> {
  const [voted, setVoted] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (slugsKey === '') return undefined
    const slugs = slugsKey.split(',')
    let cancelled = false
    fetchMyVotes(kind, slugs)
      .then((r) => {
        if (!cancelled) setVoted(new Set(r.voted))
      })
      .catch(() => {
        /* tolerate — buttons render as un-voted until the user clicks */
      })
    return () => {
      cancelled = true
    }
  }, [kind, slugsKey])
  return voted
}
