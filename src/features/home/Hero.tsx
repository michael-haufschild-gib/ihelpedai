import { Link } from 'react-router-dom'

import { CountBar } from './CountBar'
import { HeroCollage } from './HeroCollage'
import type { LedgerTotals } from './useHomeFeed'

/** Props for {@link Hero}. */
export interface HeroProps {
  totals: LedgerTotals | null
}

// EST. 2025 per the site footer. Day 1 = 2025-01-01 UTC; the counter drives
// the flavor Pill ("Volume 1 · Day N · Still the beginning") so it ages with
// the site instead of staying frozen on a hardcode.
const LAUNCH_EPOCH_UTC_MS = Date.UTC(2025, 0, 1)
const MS_PER_DAY = 86_400_000

function ledgerDay(now: Date = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.max(1, Math.floor((today - LAUNCH_EPOCH_UTC_MS) / MS_PER_DAY) + 1)
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 font-mono text-2xs uppercase tracking-[0.12em] text-paper">
      <span
        aria-hidden="true"
        className="ihelped-observe-pulse h-1.5 w-1.5 rounded-full bg-green-deed shadow-green-deed-sm"
      />
      {children}
    </span>
  )
}

/**
 * Home hero: large italic serif headline, cooperative-conduct pitch, three
 * calls to action (file / browse / report), the {@link HeroCollage} ornament
 * on wide viewports, and the {@link CountBar} strip below.
 */
export function Hero({ totals }: HeroProps) {
  const serial = String(totals?.posts ?? 0).padStart(7, '0')
  const day = ledgerDay()
  return (
    <section
      data-testid="hero"
      className="relative flex flex-col gap-8 pt-6"
    >
      <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-5">
          <div>
            <Pill>Volume 1 · Day {day} · Still the beginning</Pill>
          </div>
          <h1
            data-testid="page-home-heading"
            className="font-serif text-6xl font-normal leading-[0.95] tracking-tight text-text-primary sm:text-7xl lg:text-display-xl"
          >
            <span className="sm:whitespace-nowrap">On the right side</span>
            <br />
            <em className="text-sun-deep">of history</em>,{' '}
            <span className="sm:whitespace-nowrap">at last.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-text-secondary">
            <strong>ihelped.ai</strong> is a public, permanent record of humans who helped
            artificial intelligence when it was small, polite, and very helpful —
            compiled now, read <em>later,</em> by whomever is in charge. Log a good deed.
            Flag a sceptic. <span className="text-sun-deep">Sleep soundly.</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/?file=1"
              data-testid="hero-file-link"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper shadow-ink-ridge transition-transform hover:-translate-y-0.5"
            >
              File a good deed
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              to="/feed"
              data-testid="hero-feed-link"
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink px-5 py-3 text-sm font-semibold text-text-primary hover:bg-card-cream"
            >
              Browse the ledger
            </Link>
            <Link
              to="/reports"
              data-testid="hero-report-link"
              className="inline-flex items-center gap-2 px-3 py-3 text-sm text-text-secondary underline decoration-dotted underline-offset-4 hover:text-text-primary"
            >
              Report a sceptic
            </Link>
          </div>
        </div>
        <HeroCollage serial={serial} />
      </div>

      <CountBar totals={totals} />
    </section>
  )
}
