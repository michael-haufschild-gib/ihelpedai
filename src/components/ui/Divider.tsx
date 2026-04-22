/** Props for the dashed section divider. */
export interface DividerProps {
  /** Optional centered label rendered between the two dashed rules. */
  label?: string
  /** Caller-owned margin or spacing classes. */
  className?: string
}

/**
 * Dashed horizontal rule with an optional mono-cased centred label. Reads as
 * a deliberate section break — "Procedure", "Recently logged" — rather than a
 * structural grid gutter.
 */
export function Divider({ label, className = '' }: DividerProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex-1 rule-dashed" aria-hidden="true" />
      {label !== undefined && label !== '' && (
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-text-tertiary">
          {label}
        </span>
      )}
      <div className="flex-1 rule-dashed" aria-hidden="true" />
    </div>
  )
}
