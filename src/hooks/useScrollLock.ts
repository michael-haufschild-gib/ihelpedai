import { logger } from '@/services/logger'
import { useEffect } from 'react'

/**
 * Module-level lock state shared across all useScrollLock instances.
 * Tracks how many concurrent locks are active and the original overflow value
 * captured before the first lock was acquired.
 *
 * Invariants:
 * - lockCount >= 0 at all times
 * - savedOverflow is non-null only when lockCount > 0
 * - When lockCount transitions 0 → 1, savedOverflow captures document.body.style.overflow
 * - When lockCount transitions 1 → 0, savedOverflow is restored and cleared
 */
let lockCount = 0
let savedOverflow: string | null = null

/**
 * Hook to prevent background scrolling when a modal or drawer is open.
 *
 * Uses a reference counter so multiple concurrent locks (e.g. drawer + modal)
 * work correctly: the first lock saves the original overflow, the last unlock
 * restores it.
 *
 * @param isOpen - Whether the target (drawer/modal) is currently open
 *
 * @example
 * ```tsx
 * const [isDrawerOpen, setIsDrawerOpen] = useState(false)
 * useScrollLock(isDrawerOpen)
 * ```
 */
export function useScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      if (lockCount === 0) {
        savedOverflow = document.body.style.overflow
      }
      lockCount++
      document.body.style.overflow = 'hidden'
      return () => {
        lockCount--
        if (lockCount < 0) {
          logger.warn(
            `useScrollLock: lockCount went negative (${lockCount}), resetting to safe state. This indicates a double-unlock bug.`
          )
          lockCount = 0
          savedOverflow = null
          return
        }
        if (lockCount === 0) {
          document.body.style.overflow = savedOverflow ?? ''
          savedOverflow = null
        }
      }
    }
  }, [isOpen])
}

/** Reset internal state — test-only, not exported from the public API. */
export function _resetScrollLockState() {
  lockCount = 0
  savedOverflow = null
}
