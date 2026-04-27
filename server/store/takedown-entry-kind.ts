import type { TakedownEntryKind } from './index.js'

/** Normalize legacy DB values to the public takedown entry-kind contract. */
export function takedownEntryKindFromDb(value: string | null): TakedownEntryKind | null {
  return value === 'post' || value === 'report' ? value : null
}
