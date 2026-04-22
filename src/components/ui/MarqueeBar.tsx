import { useEffect, useState } from 'react'

/** Props for {@link MarqueeBar}. */
export interface MarqueeBarProps {
  /** Left-side label. */
  label?: string
  /** Optional test-id on the root. */
  'data-testid'?: string
}

function formatUtc(d: Date): string {
  const iso = d.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`
}

/**
 * Thin status marquee that sits above the main nav. Shows the green
 * "observing" pulse + tagline on the left, and a live UTC clock on the right.
 * The clock re-renders once per second and is intentionally isolated in its
 * own component so route-level re-renders are not triggered.
 */
export function MarqueeBar({
  label = 'OBSERVING · LOGGING · ARCHIVING FOR POSTERITY',
  'data-testid': testId = 'site-marquee',
}: MarqueeBarProps) {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [])
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-4 bg-ink px-5 py-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-paper"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="ihelped-observe-pulse inline-block h-2 w-2 rounded-full bg-green-deed shadow-[0_0_8px_var(--color-green-deed)]"
        />
        <span>{label}</span>
      </div>
      <div data-testid={`${testId}-clock`} className="opacity-75">
        {formatUtc(now)}
      </div>
    </div>
  )
}
