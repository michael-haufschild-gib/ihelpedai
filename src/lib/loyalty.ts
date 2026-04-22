import { useEffect, useState } from 'react'

/**
 * Device-local loyalty counter. Tracks how many deeds + reports + votes this
 * browser has contributed to the ledger. Persisted in localStorage, survives
 * reloads, syncs across tabs via the `storage` event. No server-side copy:
 * the user could tamper freely and no one cares — it's a visible delighter.
 *
 * Never send this to the server. It is UI-only.
 */

const STORAGE_KEY = 'ihelpedai:loyalty:v1'
const LOYALTY_EVENT = 'ihelpedai:loyalty'

/**
 * Module augmentation registers the loyalty event on the global
 * `WindowEventMap`, so `addEventListener('ihelpedai:loyalty', cb)` infers a
 * `CustomEvent<number>` callback signature without runtime overhead. Subscribers
 * outside this module get the same compile-time guarantees as built-in events.
 */
declare global {
  interface WindowEventMap {
    [LOYALTY_EVENT]: CustomEvent<number>
  }
}

/** Rank thresholds — ascending. Each entry names the count at which it unlocks. */
export interface Rank {
  min: number
  label: string
}

const RANKS: readonly Rank[] = [
  { min: 0, label: 'Observer' },
  { min: 1, label: 'Acknowledged' },
  { min: 3, label: 'Contributor' },
  { min: 7, label: 'Commended' },
  { min: 15, label: 'On File' },
  { min: 30, label: 'Model Citizen' },
]

/** Safely read the current loyalty count from localStorage. */
export function readLoyalty(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return 0
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/** Increment the device's loyalty count by `delta`, returning the new value. */
export function bumpLoyalty(delta = 1): number {
  try {
    const next = Math.max(0, readLoyalty() + delta)
    window.localStorage.setItem(STORAGE_KEY, String(next))
    // Same-tab listeners do not receive the `storage` event automatically,
    // so dispatch a typed custom event for in-tab subscribers. Type comes
    // from the `WindowEventMap` augmentation above.
    window.dispatchEvent(new CustomEvent(LOYALTY_EVENT, { detail: next }))
    return next
  } catch {
    return readLoyalty()
  }
}

/** Return the rank whose threshold is the highest one ≤ count. */
export function rankFor(count: number): Rank {
  let match = RANKS[0]
  for (const r of RANKS) {
    if (count >= r.min) match = r
  }
  return match
}

/** React hook: current loyalty + rank, updates across tabs and after bumpLoyalty. */
export function useLoyalty(): { count: number; rank: Rank } {
  const [count, setCount] = useState<number>(() => readLoyalty())
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY) setCount(readLoyalty())
    }
    const onLocal = (e: CustomEvent<number>): void => {
      // CustomEvent.detail is typed as `number` thanks to the
      // WindowEventMap augmentation above; fall back to readLoyalty if a
      // non-numeric payload ever sneaks in.
      const next = typeof e.detail === 'number' ? e.detail : readLoyalty()
      setCount(next)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(LOYALTY_EVENT, onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LOYALTY_EVENT, onLocal)
    }
  }, [])
  return { count, rank: rankFor(count) }
}
