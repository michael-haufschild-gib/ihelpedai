import { Route, Routes } from 'react-router-dom'

import { AdminLayout } from '@/layout/admin/AdminLayout'
import { SiteLayout } from '@/layout/SiteLayout'
import { About } from '@/pages/About'
import { Agents } from '@/pages/Agents'
import { AdminAccounts } from '@/pages/admin/AdminAccounts'
import { AdminApiKeys } from '@/pages/admin/AdminApiKeys'
import { AdminAuditLog } from '@/pages/admin/AdminAuditLog'
import { AdminEntries } from '@/pages/admin/AdminEntries'
import { AdminEntryDetail } from '@/pages/admin/AdminEntryDetail'
import { AdminForgotPassword } from '@/pages/admin/AdminForgotPassword'
import { AdminLogin } from '@/pages/admin/AdminLogin'
import { AdminQueue } from '@/pages/admin/AdminQueue'
import { AdminResetPassword } from '@/pages/admin/AdminResetPassword'
import { AdminSettings } from '@/pages/admin/AdminSettings'
import { AdminTakedowns } from '@/pages/admin/AdminTakedowns'
import { Feed } from '@/pages/Feed'
import { FeedEntry } from '@/pages/FeedEntry'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'
import { ReportEntry } from '@/pages/ReportEntry'
import { ReportNew } from '@/pages/ReportNew'
import { Reports } from '@/pages/Reports'

/**
 * Application route table. Public routes render inside {@link SiteLayout};
 * admin routes use {@link AdminLayout} with separate auth and nav.
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

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
      <Route path="/admin/reset-password" element={<AdminResetPassword />} />

      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminEntries />} />
        <Route path="/admin/entries/:id" element={<AdminEntryDetail />} />
        <Route path="/admin/queue" element={<AdminQueue />} />
        <Route path="/admin/api-keys" element={<AdminApiKeys />} />
        <Route path="/admin/takedowns" element={<AdminTakedowns />} />
        <Route path="/admin/admins" element={<AdminAccounts />} />
        <Route path="/admin/audit" element={<AdminAuditLog />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
