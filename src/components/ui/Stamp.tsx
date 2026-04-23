import type { ReactNode } from 'react'

import { sx } from '@/lib/sx'

/** Valid colour tokens for {@link Stamp}. */
export type StampTone = 'red' | 'indigo' | 'sun' | 'green' | 'ink'

const TONE_CLASS: Record<StampTone, string> = {
  red: 'text-stamp-red border-stamp-red',
  indigo: 'text-indigo-ink border-indigo-ink',
  sun: 'text-sun-deep border-sun-deep',
  green: 'text-green-deed border-green-deed',
  ink: 'text-text-primary border-ink',
}

/** Props for the rubber-stamp chip. */
export interface StampProps {
  /** Text to render inside the stamp; rendered in uppercase. */
  children: ReactNode
  /** Rotation in degrees. Small positive/negative values read as "hand-stamped". */
  tilt?: number
  /** Colour tone. */
  tone?: StampTone
  /** Base font-size in px; border and padding scale accordingly. */
  size?: number
  /** Extra className for caller-owned spacing. */
  className?: string
}

/**
 * Rubber-stamp chip: monospace, bordered, slightly rotated. Used across the
 * public surfaces to mark cards with "FILED", "COMMENDABLE", etc. Purely
 * decorative — never carries interactive state.
 */
export function Stamp({
  children,
  tilt = -6,
  tone = 'red',
  size = 11,
  className = '',
}: StampProps) {
  return (
    <span
      className={`inline-block whitespace-nowrap border-2 font-mono font-bold uppercase ${TONE_CLASS[tone]} ${className}`}
      style={sx({
        fontSize: size,
        letterSpacing: '0.12em',
        padding: '3px 7px',
        borderRadius: 3,
        transform: `rotate(${String(tilt)}deg)`,
        opacity: 0.85,
        boxShadow: 'inset 0 0 0 1px oklch(100% 0 0deg / 35%)',
      })}
    >
      {children}
    </span>
  )
}
