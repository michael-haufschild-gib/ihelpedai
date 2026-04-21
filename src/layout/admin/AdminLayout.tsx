import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { logout } from '@/lib/adminApi'
import { useAdminStore } from '@/stores/adminStore'

import { AdminNav } from './AdminNav'

/** Admin backoffice shell with top bar, sidebar nav, and content slot. */
export function AdminLayout() {
  const { admin, loading, checkSession, clear } = useAdminStore()
  const navigate = useNavigate()

  useEffect(() => {
    checkSession()
  }, [checkSession])

  useEffect(() => {
    if (!loading && !admin) {
      navigate('/admin/login', { replace: true })
    }
  }, [loading, admin, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app text-text-primary">
        <p data-testid="admin-loading" className="text-text-secondary">Loading...</p>
      </div>
    )
  }

  if (!admin) return null

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      clear()
      navigate('/admin/login', { replace: true })
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-app text-text-primary">
      <header
        data-testid="admin-header"
        className="flex items-center justify-between border-b border-border-default bg-panel px-4 py-3"
      >
        <span className="text-lg font-semibold">ihelped.ai admin</span>
        <div className="flex items-center gap-3">
          <span data-testid="admin-email" className="text-sm text-text-secondary">{admin.email}</span>
          <Button
            data-testid="admin-logout"
            variant="ghost"
            size="sm"
            className="text-text-secondary"
            onClick={handleLogout}
          >
            Log out
          </Button>
        </div>
      </header>
      <div className="flex flex-1">
        <AdminNav />
        <main data-testid="admin-main" className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
