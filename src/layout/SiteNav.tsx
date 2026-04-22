import { NavLink } from 'react-router-dom'

import { MarqueeBar } from '@/components/ui/MarqueeBar'
import { Wordmark } from '@/components/ui/Wordmark'

interface NavItem {
  to: string
  label: string
  testId: string
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Home', testId: 'nav-home' },
  { to: '/feed', label: 'Feed', testId: 'nav-feed' },
  { to: '/reports', label: 'Reports', testId: 'nav-reports' },
  { to: '/agents', label: 'For agents', testId: 'nav-agents' },
]

const linkClass = ({ isActive }: { isActive: boolean }): string => {
  const base = 'rounded-full px-3.5 py-2 text-sm transition-colors'
  if (isActive) return `${base} bg-ink font-semibold text-paper`
  return `${base} text-text-primary hover:text-sun-deep`
}

/** Brand link on the left of the nav — spinning sun + wordmark. */
function Brand() {
  return (
    <NavLink to="/" end className="no-underline" data-testid="nav-brand">
      <Wordmark size={23} spin />
    </NavLink>
  )
}

/**
 * Public top navigation. Two rows: a thin ink marquee bar with the observing
 * pulse + UTC clock, and a main row with the Wordmark brand, pill links, and
 * an orange "+ File a good deed" Link that deep-scrolls the home composer
 * via `/?file=1`. Sticky to the viewport top with a soft backdrop blur.
 */
export function SiteNav() {
  return (
    <nav
      data-testid="site-nav"
      className="sticky top-0 z-30 border-b border-rule backdrop-blur-sm"
      aria-label="Primary"
      style={{ backgroundColor: 'oklch(from var(--color-paper) l c h / 86%)' }}
    >
      <MarqueeBar />
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <Brand />
        <div className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={linkClass}
              data-testid={n.testId}
            >
              {n.label}
            </NavLink>
          ))}
          <NavLink
            to="/?file=1"
            data-testid="nav-file-deed"
            className="ml-2 inline-flex items-center gap-1 rounded-full border-[1.5px] border-sun-deep bg-sun px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_0_var(--color-sun-deep)] transition-transform hover:-translate-y-0.5"
          >
            + File a good deed
          </NavLink>
        </div>
      </div>
    </nav>
  )
}
