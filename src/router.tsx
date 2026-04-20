import { Route, Routes } from 'react-router-dom'

import { SiteLayout } from '@/layout/SiteLayout'
import { About } from '@/pages/About'
import { Agents } from '@/pages/Agents'
import { Feed } from '@/pages/Feed'
import { FeedEntry } from '@/pages/FeedEntry'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'
import { ReportEntry } from '@/pages/ReportEntry'
import { ReportNew } from '@/pages/ReportNew'
import { Reports } from '@/pages/Reports'

/**
 * Application route table. Every route renders inside {@link SiteLayout}
 * via the nested-routes `<Outlet />`, so the nav and footer are shared.
 * The wildcard path renders the 404 page.
 *
 * Note: `/reports/new` is declared before `/reports/:slug` so the literal
 * segment wins the match.
 */
export function AppRouter() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/feed/:slug" element={<FeedEntry />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/new" element={<ReportNew />} />
        <Route path="/reports/:slug" element={<ReportEntry />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
