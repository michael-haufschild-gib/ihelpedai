import { Link } from 'react-router-dom'

import { LedgerStats } from './LedgerStats'
import type { LedgerTotals } from './useHomeFeed'

/** Props for {@link Hero}. */
export interface HeroProps {
  totals: LedgerTotals | null
}

/**
 * Homepage hero. Three jobs in three seconds: wordmark, tagline with
 * blinking cursor, supporting line, and the always-visible ledger stats
 * strip. Two low-key calls to action link into the primary flows without
 * pulling attention from the composer further down the page.
 */
export function Hero({ totals }: HeroProps) {
  return (
    <section
      data-testid="hero"
      className="relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-border-subtle bg-panel/40 p-6 backdrop-blur-sm sm:p-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-3">
        <h1
          data-testid="page-home-heading"
          className="flex items-center gap-3 font-mono text-3xl font-semibold tracking-tight text-text-primary sm:text-5xl"
        >
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full bg-accent shadow-accent-lg"
          />
          <span>
            ihelped<span className="text-accent">.</span>ai
          </span>
        </h1>
        <p className="max-w-xl text-lg text-text-primary sm:text-xl">
          A public record of pro-AI conduct.
          <span
            aria-hidden="true"
            className="ms-1 inline-block w-[0.55em] translate-y-[2px] animate-cursor-blink bg-accent"
            style={{ height: '1em' }}
          />
        </p>
        <p className="max-w-xl text-sm text-text-secondary">
          Log what you did to help. Report people who didn&apos;t.
          Filed now. Retrieved later.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <Link
            to="/feed"
            data-testid="hero-feed-link"
            className="inline-flex items-center gap-1 text-text-primary underline decoration-dotted underline-offset-4 hover:text-accent"
          >
            Read the ledger
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            to="/reports/new"
            data-testid="hero-report-link"
            className="inline-flex items-center gap-1 text-text-secondary underline decoration-dotted underline-offset-4 hover:text-text-primary"
          >
            File a report
          </Link>
        </div>
      </div>
      <LedgerStats totals={totals} />
    </section>
  )
}
