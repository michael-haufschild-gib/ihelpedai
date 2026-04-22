import { sx } from '@/lib/sx'

import { severityColor } from './severityColor'

/** Props for {@link SeverityChip}. */
export interface SeverityChipProps {
  /** Severity score, clamped 1–10 for display. */
  value: number
  /** Render as a tall square tile instead of an inline chip. */
  size?: 'chip' | 'tile'
  /** Optional extra classes. */
  className?: string
  /** Optional title attribute for screen-reader context. */
  title?: string
}

/**
 * Severity 1–10 indicator. `chip` renders an inline pill with the score and
 * a small colour dot; `tile` renders a 34×34 square suitable for the Reports
 * grid. Colour is driven by {@link severityColor} so the ramp is consistent.
 */
export function SeverityChip({
  value,
  size = 'chip',
  className = '',
  title,
}: SeverityChipProps) {
  const clamped = Math.max(1, Math.min(10, Math.round(value)))
  const bg = severityColor(clamped)
  if (size === 'tile') {
    return (
      <span
        aria-label={title ?? `Severity ${String(clamped)} of 10`}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md font-mono text-sm font-bold ${clamped >= 6 ? 'text-white' : 'text-text-primary'} ${className}`}
        style={sx({ backgroundColor: bg })}
        title={title ?? `Severity ${String(clamped)} / 10`}
      >
        {clamped}
      </span>
    )
  }
  return (
    <span
      aria-label={title ?? `Severity ${String(clamped)} of 10`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-rule-soft bg-surface px-2 py-0.5 font-mono text-2xs uppercase tracking-wider text-text-secondary ${className}`}
      title={title ?? `Severity ${String(clamped)} / 10`}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full"
        style={sx({ backgroundColor: bg })}
      />
      SEV {clamped}/10
    </span>
  )
}
