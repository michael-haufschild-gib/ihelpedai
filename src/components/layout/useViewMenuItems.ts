import { useMemo } from 'react'
import {
  THEME_MODES,
  THEME_LABELS,
  ACCENT_COLORS,
  REDUCED_MOTION_OPTIONS,
  REDUCED_MOTION_LABELS,
  type ThemeMode,
  type AccentColor,
  type ReducedMotionPreference,
} from '@/stores/layoutStore'
import type { DropdownMenuItem } from '@/components/ui/DropdownMenu'

/** Capitalize first letter of a string for display labels. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Builds the VIEW dropdown menu items for theme, accent, and motion selection. */
export function useViewMenuItems(
  theme: ThemeMode,
  setTheme: (t: ThemeMode) => void,
  accent: AccentColor,
  setAccent: (a: AccentColor) => void,
  reducedMotion: ReducedMotionPreference,
  setReducedMotion: (p: ReducedMotionPreference) => void
): DropdownMenuItem[] {
  const modeItems = useMemo(
    () =>
      THEME_MODES.map((mode) => ({
        label: (theme === mode ? '✓ ' : '  ') + THEME_LABELS[mode],
        onClick: () => setTheme(mode),
        'data-testid': `theme-${mode}`,
      })),
    [theme, setTheme]
  )

  const accentItems = useMemo(
    () =>
      ACCENT_COLORS.map((color) => ({
        label: (accent === color ? '✓ ' : '  ') + capitalize(color),
        onClick: () => setAccent(color),
        'data-testid': `accent-${color}`,
      })),
    [accent, setAccent]
  )

  const motionItems = useMemo(
    () =>
      REDUCED_MOTION_OPTIONS.map((pref) => ({
        label: (reducedMotion === pref ? '✓ ' : '  ') + REDUCED_MOTION_LABELS[pref],
        onClick: () => setReducedMotion(pref),
        'data-testid': `motion-${pref}`,
      })),
    [reducedMotion, setReducedMotion]
  )

  return useMemo(
    () => [
      { label: 'Theme', items: modeItems },
      { label: 'Accent', items: accentItems },
      { label: 'Motion', items: motionItems },
    ],
    [modeItems, accentItems, motionItems]
  )
}
