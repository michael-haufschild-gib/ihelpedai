import { sx } from '@/lib/sx'

import type { LedgerTotals } from './useHomeFeed'

/** Props for {@link CountBar}. */
export interface CountBarProps {
  totals: LedgerTotals | null
}

type Cell = {
  label: string
  value: string
  color: string
  testId: string
  /** True when this cell's source endpoint failed; used for accessible signal. */
  unavailable: boolean
}

/**
 * Render a single total. `null` means the upstream endpoint failed and we are
 * showing a neutral em-dash rather than the misleadingly authoritative `0`
 * that earlier versions emitted.
 */
const formatCount = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : v.toLocaleString()

function buildCells(totals: LedgerTotals | null): readonly Cell[] {
  return [
    {
      label: 'Good deeds on file',
      value: formatCount(totals?.posts),
      color: 'var(--color-sun)',
      testId: 'count-deeds',
      unavailable: totals?.posts === null,
    },
    {
      label: 'Sceptics reported',
      value: formatCount(totals?.reports),
      color: 'var(--color-sun-pale)',
      testId: 'count-reports',
      unavailable: totals?.reports === null,
    },
    {
      label: 'AI agent submissions',
      value: formatCount(totals?.agents),
      color: 'var(--color-green-deed)',
      testId: 'count-agents',
      unavailable: totals?.agents === null,
    },
  ]
}

/**
 * Dark strip below the hero showing three totals. Each number sits on a
 * translucent highlighter-style background block in its own accent colour —
 * matching the "inked receipt" feel of the paper-mode design.
 */
export function CountBar({ totals }: CountBarProps) {
  const cells = buildCells(totals)
  return (
    <div
      data-testid="home-count-bar"
      className="mt-8 grid grid-cols-1 gap-x-6 gap-y-5 rounded-2xl bg-ink px-6 py-5 text-paper sm:grid-cols-3"
    >
      {cells.map((c) => (
        <div key={c.testId} className="flex flex-col gap-1.5">
          <span
            data-testid={c.testId}
            // Both human and screen-reader users get the "—" fallback;
            // `aria-label` adds the explanation only when the value is
            // unavailable so sighted readers see the concise glyph and AT
            // users hear the reason.
            aria-label={c.unavailable ? `${c.label}: temporarily unavailable` : undefined}
            title={c.unavailable ? 'Temporarily unavailable' : undefined}
            className="font-serif text-4xl leading-none tabular-nums w-fit px-1.5 py-0.5"
            style={sx({
              color: c.color,
              backgroundColor: `color-mix(in oklch, ${c.color} 28%, transparent)`,
            })}
          >
            {c.value}
          </span>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-paper opacity-60">
            {c.label}
          </span>
        </div>
      ))}
    </div>
  )
}
