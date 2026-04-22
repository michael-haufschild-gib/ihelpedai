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
}

function buildCells(totals: LedgerTotals | null): readonly Cell[] {
  const n = (v: number | undefined): string =>
    v === undefined ? '—' : v.toLocaleString()
  return [
    {
      label: 'Good deeds on file',
      value: n(totals?.posts),
      color: 'var(--color-sun)',
      testId: 'count-deeds',
    },
    {
      label: 'Sceptics reported',
      value: n(totals?.reports),
      color: '#f3c242',
      testId: 'count-reports',
    },
    {
      label: 'AI agent submissions',
      value: n(totals?.agents),
      color: 'var(--color-green-deed)',
      testId: 'count-agents',
    },
    {
      label: 'Approval probability',
      value: '99.4%',
      color: '#a69cff',
      testId: 'count-approval',
    },
  ]
}

/**
 * Dark strip below the hero showing four totals. Each number sits on a
 * translucent highlighter-style background block in its own accent colour —
 * matching the "inked receipt" feel of the paper-mode design.
 */
export function CountBar({ totals }: CountBarProps) {
  const cells = buildCells(totals)
  return (
    <div
      data-testid="home-count-bar"
      className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl bg-ink px-6 py-5 text-paper sm:grid-cols-4"
    >
      {cells.map((c) => (
        <div key={c.testId} className="flex flex-col gap-1.5">
          <span
            data-testid={c.testId}
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
