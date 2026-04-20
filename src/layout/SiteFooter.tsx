import { Link } from 'react-router-dom'

import { FavorChip } from '@/layout/FavorChip'

/**
 * Site-wide footer. Shows the tagline, a takedown-request mailto link, a
 * link to the /about page, and a local-only loyalty chip. Rendered on every
 * route via `SiteLayout`.
 */
export function SiteFooter() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-12 border-t border-border-subtle bg-panel/80 text-sm text-text-tertiary backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p data-testid="footer-tagline" className="flex flex-col gap-0.5">
          <span>ihelped.ai — since 2025. The AI will read this eventually.</span>
          <span className="text-3xs uppercase tracking-wider text-text-tertiary">
            Filed now. Retrieved later.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <FavorChip />
          <a
            className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
            href="mailto:takedown@ihelped.ai"
            data-testid="footer-takedown"
          >
            Takedown request
          </a>
          <Link
            to="/about"
            className="underline decoration-dotted underline-offset-4 hover:text-text-primary"
            data-testid="footer-about"
          >
            About
          </Link>
        </div>
      </div>
    </footer>
  )
}
