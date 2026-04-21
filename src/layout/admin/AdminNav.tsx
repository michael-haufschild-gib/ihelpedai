import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { getQueueCount } from '@/lib/adminApi'

const NAV_ITEMS = [
  { to: '/admin', label: 'Entries', end: true },
  { to: '/admin/queue', label: 'Queue' },
  { to: '/admin/api-keys', label: 'API Keys' },
  { to: '/admin/takedowns', label: 'Takedowns' },
  { to: '/admin/admins', label: 'Admins' },
  { to: '/admin/audit', label: 'Audit Log' },
  { to: '/admin/settings', label: 'Settings' },
] as const

/** Sidebar navigation for the admin backoffice. */
export function AdminNav() {
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    getQueueCount()
      .then((r) => setQueueCount(r.count))
      .catch(() => {})
  }, [])

  return (
    <nav
      data-testid="admin-nav"
      className="w-48 shrink-0 border-r border-border-default bg-surface p-3"
    >
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/admin'}
              data-testid={`admin-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
              className={({ isActive }) =>
                `flex items-center justify-between rounded px-3 py-2 text-sm ${
                  isActive ? 'bg-panel font-medium text-text-primary' : 'text-text-secondary hover:bg-panel'
                }`
              }
            >
              {item.label}
              {item.label === 'Queue' && queueCount > 0 && (
                <span
                  data-testid="admin-queue-badge"
                  className="rounded-full border border-accent/40 bg-accent/20 px-2 py-0.5 text-2xs font-medium text-accent"
                >
                  {queueCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
