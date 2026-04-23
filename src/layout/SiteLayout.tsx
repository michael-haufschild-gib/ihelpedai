import { Outlet } from 'react-router-dom'

import { SiteFooter } from '@/layout/SiteFooter'
import { SiteNav } from '@/layout/SiteNav'

/**
 * Top-level public chrome. Wraps the outlet in a nested `data-app-theme`
 * scope set to `paper-day` + `orange` accent so every public page resolves
 * its semantic tokens from the paper theme without affecting the admin
 * section, which continues to inherit `dark-black` from the document root.
 *
 * The `.paper-shell` class on this element powers the radial-gradient wash
 * and the fine SVG noise overlay declared in `src/styles/theme-paper-day.css`.
 */
export function SiteLayout() {
  return (
    <div
      data-app-theme=""
      data-mode="paper-day"
      data-accent="orange"
      className="paper-shell flex min-h-screen flex-col bg-app text-text-primary"
    >
      <SiteNav />
      <main
        data-testid="site-main"
        className="mx-auto w-full max-w-site flex-1 px-6 py-8"
      >
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
