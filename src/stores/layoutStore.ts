/**
 * Layout Store
 * Persists the admin theme + accent for portal-rendered UI (Modal, Toast).
 * Public pages set their own `data-mode` + `data-accent` on SiteLayout, so
 * this store's values only affect the admin shell (which inherits root
 * attributes) and the portal surfaces that need to re-declare them inside
 * the top layer.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Theme modes + accent colors are the data-attribute vocabulary driven by
// main.tsx and the [data-app-theme] CSS scope. Kept module-private until a
// consumer (e.g. a future theme picker) actually needs the arrays or types
// outside this store.
const THEME_MODES = ['dark-purple', 'dark-blue', 'dark-brown', 'dark-black'] as const
type ThemeMode = (typeof THEME_MODES)[number]

const ACCENT_COLORS = [
  'cyan',
  'green',
  'magenta',
  'orange',
  'blue',
  'violet',
  'red',
] as const
type AccentColor = (typeof ACCENT_COLORS)[number]

// Defaults match the root attributes set in main.tsx so portaled admin UI
// (Modal, Toast) render with the same palette as their host page instead of
// drifting back to an earlier starter default.
const DEFAULT_THEME: ThemeMode = 'dark-black'
const DEFAULT_ACCENT: AccentColor = 'violet'

/** Persisted shell state consumed by Modal + Toast for portal theme scoping. */
export interface LayoutStore {
  theme: ThemeMode
  accent: AccentColor
}

const VALID_THEMES = new Set<string>(THEME_MODES)
const VALID_ACCENTS = new Set<string>(ACCENT_COLORS)

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (): LayoutStore => ({
      theme: DEFAULT_THEME,
      accent: DEFAULT_ACCENT,
    }),
    {
      name: 'ihelpedai-layout',
      merge: (persistedState, currentState) => {
        const merged: LayoutStore = {
          ...currentState,
          ...(persistedState as Partial<LayoutStore>),
        }
        if (!VALID_THEMES.has(merged.theme)) {
          merged.theme = DEFAULT_THEME
        }
        if (!VALID_ACCENTS.has(merged.accent)) {
          merged.accent = DEFAULT_ACCENT
        }
        return merged
      },
    },
  ),
)
