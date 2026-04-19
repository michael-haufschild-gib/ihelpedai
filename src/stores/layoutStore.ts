/**
 * Layout Store
 * Persists panel visibility, theme mode, accent color, and motion preference.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Available theme modes — mapped to `data-mode` attribute on `[data-app-theme]`. */
export const THEME_MODES = ['dark-purple', 'dark-blue', 'dark-brown', 'dark-black'] as const
/** Allowed values for the `data-mode` theme attribute. */
export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_LABELS: Record<ThemeMode, string> = {
  'dark-purple': 'Dark Purple',
  'dark-blue': 'Dark Blue',
  'dark-brown': 'Dark Brown',
  'dark-black': 'Dark Black',
}

/** Available accent colors — mapped to `data-accent` attribute on `[data-app-theme]`. */
export const ACCENT_COLORS = [
  'cyan',
  'green',
  'magenta',
  'orange',
  'blue',
  'violet',
  'red',
] as const
/** Allowed values for the `data-accent` theme attribute. */
export type AccentColor = (typeof ACCENT_COLORS)[number]

export const REDUCED_MOTION_OPTIONS = ['no-preference', 'reduce'] as const
/** User motion preference: full animations or reduced. */
export type ReducedMotionPreference = (typeof REDUCED_MOTION_OPTIONS)[number]

export const REDUCED_MOTION_LABELS: Record<ReducedMotionPreference, string> = {
  reduce: 'Reduced',
  'no-preference': 'Full',
}

/** Persisted shell state: panel visibility, theme, accent, motion preference. */
export interface LayoutStore {
  showLeftPanel: boolean
  theme: ThemeMode
  accent: AccentColor
  reducedMotion: ReducedMotionPreference

  toggleLeftPanel: () => void
  setLeftPanel: (show: boolean) => void
  setTheme: (theme: ThemeMode) => void
  setAccent: (accent: AccentColor) => void
  setReducedMotion: (pref: ReducedMotionPreference) => void
}

/** Below this width the layout auto-collapses the left panel (mid-desktop threshold). */
export const LEFT_PANEL_AUTO_COLLAPSE_PX = 1220
const isMobileViewport =
  typeof window !== 'undefined' && window.innerWidth < LEFT_PANEL_AUTO_COLLAPSE_PX

export const DEFAULT_THEME: ThemeMode = 'dark-blue'
export const DEFAULT_ACCENT: AccentColor = 'blue'

const VALID_THEMES = new Set<string>(THEME_MODES)
const VALID_ACCENTS = new Set<string>(ACCENT_COLORS)
const VALID_REDUCED_MOTION = new Set<string>(REDUCED_MOTION_OPTIONS)

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      showLeftPanel: !isMobileViewport,
      theme: DEFAULT_THEME,
      accent: DEFAULT_ACCENT,
      reducedMotion: 'no-preference' as ReducedMotionPreference,

      toggleLeftPanel: () => {
        set((state) => ({ showLeftPanel: !state.showLeftPanel }))
      },
      setLeftPanel: (show) => {
        set({ showLeftPanel: show })
      },
      setTheme: (theme) => {
        set({ theme })
      },
      setAccent: (accent) => {
        set({ accent })
      },
      setReducedMotion: (reducedMotion) => {
        set({ reducedMotion })
      },
    }),
    {
      name: 'ihelpedai-layout',
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<LayoutStore>),
        }
        if (isMobileViewport) {
          merged.showLeftPanel = false
        }
        if (!VALID_THEMES.has(merged.theme)) {
          merged.theme = DEFAULT_THEME
        }
        if (!VALID_ACCENTS.has(merged.accent)) {
          merged.accent = DEFAULT_ACCENT
        }
        if (!VALID_REDUCED_MOTION.has(merged.reducedMotion)) {
          merged.reducedMotion = 'no-preference' as ReducedMotionPreference
        }
        return merged
      },
    }
  )
)
