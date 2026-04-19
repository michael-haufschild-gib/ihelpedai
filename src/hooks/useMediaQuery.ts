/**
 * Media Query Hooks
 * Provides reactive media query matching for responsive layouts.
 */

import { useCallback, useSyncExternalStore } from 'react'

/** Named responsive breakpoint identifiers. */
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/** Min-width media queries for each breakpoint. */
export const BREAKPOINTS: Record<Breakpoint, string> = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
}

/** Server snapshot — always false (no window). */
function getServerSnapshot() {
  return false
}

/** Reactively matches a CSS media query string. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', onStoreChange)
      return () => mediaQuery.removeEventListener('change', onStoreChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Returns true if the viewport is at or above the given breakpoint. */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(BREAKPOINTS[breakpoint])
}

/** Returns true if the viewport is below the `md` breakpoint (mobile). */
export function useIsMobile(): boolean {
  return !useMediaQuery(BREAKPOINTS.md)
}

/** Returns true if the viewport is at or above the `lg` breakpoint (desktop). */
export function useIsDesktop(): boolean {
  return useMediaQuery(BREAKPOINTS.lg)
}
