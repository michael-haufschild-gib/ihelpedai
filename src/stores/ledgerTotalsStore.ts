import { useEffect } from 'react'
import { create } from 'zustand'

import { getLedgerTotals, type LedgerTotalsResponse } from '@/lib/api'

/**
 * Cached `GET /api/totals` payload, plus the per-cell error flags the
 * SPA needs to render `—` instead of an authoritative `0` when a backing
 * fetch fails. The shape mirrors the `LedgerTotals` type the home hero
 * already consumed via `useHomeFeed`, so existing components do not need
 * to learn a new vocabulary.
 */
export interface CachedLedgerTotals {
  readonly posts: number | null
  readonly reports: number | null
  readonly agents: number | null
}

/**
 * Time-to-live for the in-memory cache. 60s is the smallest interval
 * that still amortizes the per-page fetch cost while keeping the totals
 * fresh enough for a busy site — every minute the next navigation that
 * needs totals refreshes them transparently.
 */
const TTL_MS = 60_000

interface LedgerTotalsState {
  totals: CachedLedgerTotals | null
  fetchedAt: number | null
  /** Set while a fetch is in flight; prevents duplicate concurrent requests. */
  inFlight: Promise<void> | null
  refreshIfStale: () => Promise<void>
}

const FAILED_TOTALS: Readonly<CachedLedgerTotals> = Object.freeze({
  posts: null,
  reports: null,
  agents: null,
})

function intoCached(payload: LedgerTotalsResponse): CachedLedgerTotals {
  return { posts: payload.posts, reports: payload.reports, agents: payload.agents }
}

/**
 * Module-private store. The `refreshIfStale` action is the only public
 * write surface; callers either consume `totals` directly or call the
 * `useLedgerTotals` hook below for a "render-once-then-refresh" view.
 */
export const useLedgerTotalsStore = create<LedgerTotalsState>((set, get) => ({
  totals: null,
  fetchedAt: null,
  inFlight: null,
  refreshIfStale: async () => {
    const { fetchedAt, inFlight } = get()
    if (inFlight !== null) {
      // De-dup: a parallel mount of the hook (Hero + Footer simultaneously)
      // must not fire two concurrent fetches at the same endpoint. The
      // promise reference is shared; both callers await the same work.
      await inFlight
      return
    }
    if (fetchedAt !== null && Date.now() - fetchedAt < TTL_MS) {
      return
    }
    const promise = (async () => {
      try {
        const payload = await getLedgerTotals()
        set({ totals: intoCached(payload), fetchedAt: Date.now() })
      } catch {
        // Render `—` instead of an authoritative `0` so a downed totals
        // endpoint cannot make the site read as empty. The fetchedAt
        // timestamp still advances so we don't hammer the failing
        // endpoint on every render.
        set({ totals: FAILED_TOTALS, fetchedAt: Date.now() })
      } finally {
        set({ inFlight: null })
      }
    })()
    set({ inFlight: promise })
    await promise
  },
}))

/**
 * React hook for components that want to render the latest cached
 * totals AND ensure they're refreshed when stale. The returned object
 * is stable across renders by virtue of Zustand's selector identity, so
 * callers can pass it to memoised children without churn.
 */
export function useLedgerTotals(): CachedLedgerTotals | null {
  const totals = useLedgerTotalsStore((s) => s.totals)
  const refreshIfStale = useLedgerTotalsStore((s) => s.refreshIfStale)
  useEffect(() => {
    void refreshIfStale()
  }, [refreshIfStale])
  return totals
}
