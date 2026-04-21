import { useEffect, useMemo, useState } from 'react'

import { fetchMyVotes } from '@/lib/api'

const EMPTY_SET: ReadonlySet<string> = new Set<string>()

/**
 * Fetch which of the given entry slugs this viewer has already voted on.
 * `slugsKey` is a comma-joined string of slugs (primitive dep for stable
 * useEffect). Tolerates fetch errors — un-voted state until the user clicks.
 */
export function useMyVotes(kind: 'post' | 'report', slugsKey: string): ReadonlySet<string> {
  const [voted, setVoted] = useState<ReadonlySet<string>>(EMPTY_SET)
  useEffect(() => {
    if (slugsKey === '') return undefined
    const slugs = slugsKey.split(',')
    let cancelled = false
    fetchMyVotes(kind, slugs)
      .then((r) => {
        if (!cancelled) setVoted(new Set(r.voted))
      })
      .catch(() => {
        if (!cancelled) setVoted(EMPTY_SET)
      })
    return () => {
      cancelled = true
    }
  }, [kind, slugsKey])
  return useMemo(() => (slugsKey === '' ? EMPTY_SET : voted), [slugsKey, voted])
}
