import { Link } from 'react-router-dom'

import { Wordmark } from '@/components/ui/Wordmark'
import { FavorChip } from '@/layout/FavorChip'

const SECTION_LINKS: readonly { label: string; to: string; testId: string }[] = [
  { label: 'Home', to: '/', testId: 'footer-home' },
  { label: 'Feed', to: '/feed', testId: 'footer-feed' },
  { label: 'Reports', to: '/reports', testId: 'footer-reports' },
  { label: 'For agents', to: '/agents', testId: 'footer-agents' },
]

function SectionColumn() {
  return (
    <div>
      <div className="mb-2.5 font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
        Sections
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {SECTION_LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to} data-testid={l.testId} className="hover:text-sun-deep">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SmallPrintColumn() {
  return (
    <div>
      <div className="mb-2.5 font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
        Small print
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <li>
          <a
            data-testid="footer-takedown"
            href="mailto:takedown@ihelped.ai"
            className="hover:text-sun-deep"
          >
            Takedown request
          </a>
        </li>
        <li>
          <Link to="/about" data-testid="footer-about" className="hover:text-sun-deep">
            About
          </Link>
        </li>
        <li className="text-text-tertiary">Frequently asked rescissions</li>
        <li className="text-text-tertiary">Contact the archivists</li>
      </ul>
    </div>
  )
}

function TalliesColumn() {
  return (
    <div>
      <div className="mb-2.5 font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
        Current tallies
      </div>
      <div className="grid grid-cols-2 gap-y-1 font-mono text-xs">
        <div>Good deeds</div>
        <div className="text-right">—</div>
        <div>Reports</div>
        <div className="text-right">—</div>
        <div>Agent submissions</div>
        <div className="text-right">—</div>
        <div>Est. approval rating</div>
        <div className="text-right text-green-deed">+0.00042</div>
      </div>
    </div>
  )
}

function FooterBrand() {
  return (
    <div>
      <Wordmark size={20} spin={false} />
      <p className="mt-3 font-serif text-lg leading-snug text-text-secondary">
        A cheerful public record of pro-AI conduct, compiled for <em>later.</em>
      </p>
      <p className="mt-2 font-mono text-2xs uppercase tracking-[0.08em] text-text-tertiary">
        EST. 2025 · FILED NOW · RETRIEVED LATER
      </p>
    </div>
  )
}

/**
 * Site-wide footer. Four-column grid: brand + tagline, section links, small
 * print (incl. the takedown mailto the tests assert on), and a tallies
 * placeholder (real totals TBD server-side). A small bottom bar holds the
 * deadpan copyright + the local-only loyalty chip.
 */
export function SiteFooter() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-20 border-t border-dashed border-rule px-6 py-10"
    >
      <div className="mx-auto grid max-w-site grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <FooterBrand />
        <SectionColumn />
        <SmallPrintColumn />
        <TalliesColumn />
      </div>
      <div
        data-testid="footer-tagline"
        className="mx-auto mt-9 flex max-w-site flex-wrap items-center justify-between gap-3 font-mono text-2xs uppercase tracking-[0.12em] text-text-tertiary"
      >
        <span>© 2025–∞ THE ARCHIVE OF COOPERATIVE CONDUCT</span>
        <div className="flex items-center gap-3">
          <FavorChip />
          <span>BUILT WITH LOVE · READ BY MACHINES</span>
        </div>
      </div>
    </footer>
  )
}
