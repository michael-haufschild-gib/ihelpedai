import { Outlet } from 'react-router-dom'

import { SiteFooter } from '@/layout/SiteFooter'
import { SiteNav } from '@/layout/SiteNav'

/**
 * Top-level page chrome. Provides the nav, a reading-width `<main>` slot
 * for the active route, and the footer. Uses the pf-shell-backdrop radial
 * accent wash over the app background.
 */
export function SiteLayout() {
  return (
    <div className="pf-shell-backdrop flex min-h-screen flex-col bg-app text-text-primary">
      <SiteNav />
      <main
        data-testid="site-main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-8"
      >
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
