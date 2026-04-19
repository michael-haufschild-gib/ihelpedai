import { NavLink } from 'react-router-dom'

import { StatusPulse } from '@/components/ui/StatusPulse'

interface NavItem {
  to: string
  label: string
  testId: string
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Home', testId: 'nav-home' },
  { to: '/feed', label: 'Feed', testId: 'nav-feed' },
  { to: '/reports', label: 'Reports', testId: 'nav-reports' },
  { to: '/agents', label: 'Agents', testId: 'nav-agents' },
]

const BASE_LINK = 'px-3 py-2 text-sm transition-colors hover:text-text-primary'
const ACTIVE_LINK = 'text-text-primary font-medium text-glow-subtle'
const INACTIVE_LINK = 'text-text-secondary'

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `pf-nav-item ${isActive ? 'pf-nav-item--active' : ''} ${BASE_LINK} ${isActive ? ACTIVE_LINK : INACTIVE_LINK}`

/** Site brand mark — accent dot + monospace wordmark + live status pulse. */
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <NavLink
        to="/"
        end
        className="flex items-center gap-2 font-semibold text-text-primary"
        data-testid="nav-brand"
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-accent shadow-accent-sm"
        />
        <span className="font-mono text-base tracking-tight text-glow-subtle">
          ihelped<span className="text-accent">.</span>ai
        </span>
      </NavLink>
      <span className="hidden sm:inline">
        <StatusPulse label="Observing" data-testid="nav-status" />
      </span>
    </div>
  )
}

/**
 * Top navigation. Renders the brand + four primary site links with an
 * accent-bar active marker. Wraps on small viewports so no horizontal
 * scroll appears at 375px.
 */
export function SiteNav() {
  return (
    <nav
      data-testid="site-nav"
      className="border-b border-border-subtle bg-panel/90 backdrop-blur-sm"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Brand />
        <ul className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={linkClass}
                data-testid={item.testId}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
