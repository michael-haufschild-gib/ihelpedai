import type { CSSProperties, ReactNode } from 'react'

/** Cream-paper card used on every public surface. */
export interface PaperCardProps {
  children: ReactNode
  /** Colour tone for the background panel. */
  tone?: 'cream' | 'white' | 'ink'
  /** Additional Tailwind classes for padding / size. */
  className?: string
  /** Inline style override for rotation, positioning, and ad-hoc width. */
  style?: CSSProperties
  /** Subtle hover lift on pointer enter — set `true` for browse grids. */
  hover?: boolean
  /** Stable test selector; falls through to the root `<div>`. */
  'data-testid'?: string
}

const TONE_CLASS: Record<NonNullable<PaperCardProps['tone']>, string> = {
  cream: 'bg-card-cream text-text-primary',
  white: 'bg-surface text-text-primary',
  ink: 'bg-ink text-paper',
}

/**
 * Paper-mode card: subtle border, layered shadow, optional hover lift. The
 * backing colour follows the requested tone so a single primitive covers the
 * cream ledger cards, the white form panels, and the ink stat strips.
 */
export function PaperCard({
  children,
  tone = 'cream',
  className = '',
  style,
  hover = false,
  'data-testid': testId,
}: PaperCardProps) {
  return (
    <div
      data-testid={testId}
      className={`relative rounded-xl border border-rule shadow-paper transition-transform ${hover ? 'hover:-translate-y-0.5' : ''} ${TONE_CLASS[tone]} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
