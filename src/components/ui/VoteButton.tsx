import { useRef, useState } from 'react'
import { m } from 'motion/react'

import type { VoteToggleResult } from '@/lib/api'

/** Variant → label + icon + color. */
export type VoteVariant = 'acknowledge' | 'concur'

/** Props for {@link VoteButton}. */
export interface VoteButtonProps {
  variant: VoteVariant
  count: number
  voted: boolean
  disabled?: boolean
  /** Async toggler — returns the server-authoritative result. */
  onToggle: () => Promise<VoteToggleResult>
  onSuccess?: (result: VoteToggleResult) => void
  'data-testid'?: string
}

type Display = { label: string; votedLabel: string; glyph: string; tonedClass: string }

const DISPLAY: Record<VoteVariant, Display> = {
  acknowledge: {
    label: 'Acknowledge',
    votedLabel: 'Acknowledged',
    glyph: '✓',
    tonedClass: 'text-accent border-accent/50 bg-accent/10',
  },
  concur: {
    label: 'Concur',
    votedLabel: 'Concurred',
    glyph: '▽',
    tonedClass: 'text-warning border-warning/50 bg-warning/10',
  },
}

const BASE_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-all disabled:opacity-50'
const IDLE_CLASS =
  'border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary'

/**
 * Toggles a vote with optimistic update. Reverts on error. Server-returned
 * `count` is authoritative. Appearance flips to the variant's accent/warning
 * tone when voted.
 */
export function VoteButton({
  variant,
  count,
  voted,
  disabled = false,
  onToggle,
  onSuccess,
  'data-testid': testId,
}: VoteButtonProps) {
  const [pending, setPending] = useState(false)
  const inFlightRef = useRef(false)
  const display = DISPLAY[variant]

  const handleClick = async (): Promise<void> => {
    if (inFlightRef.current || disabled) return
    inFlightRef.current = true
    setPending(true)
    try {
      const result = await onToggle()
      onSuccess?.(result)
    } catch {
      // Tolerate — the parent renders the authoritative count on next render.
    } finally {
      inFlightRef.current = false
      setPending(false)
    }
  }

  const tone = voted ? display.tonedClass : IDLE_CLASS
  const label = voted ? display.votedLabel : display.label

  return (
    <m.button
      type="button"
      onClick={() => {
        void handleClick()
      }}
      disabled={disabled || pending}
      className={`${BASE_CLASS} ${tone}`}
      data-testid={testId}
      aria-pressed={voted}
      whileTap={{ scale: 0.94 }}
    >
      <span aria-hidden="true">{display.glyph}</span>
      <span>{label}</span>
      <span
        data-testid={testId === undefined ? undefined : `${testId}-count`}
        className="tabular-nums"
      >
        {count}
      </span>
    </m.button>
  )
}
