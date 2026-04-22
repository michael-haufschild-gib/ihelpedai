/** Option in a {@link Chips} segmented control. */
export interface ChipOption<T extends string> {
  value: T
  label: string
  /** Optional test-id suffix; falls back to `value`. */
  testId?: string
}

/** Props for {@link Chips}. */
export interface ChipsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: readonly ChipOption<T>[]
  /** Test-id prefix for the root and each chip. */
  testIdPrefix: string
  /** Optional aria-label on the group. */
  ariaLabel?: string
  className?: string
}

/**
 * Pill-style segmented control for short filter / sort choices. Matches the
 * Feed design's "All deeds / Most recent" pattern. Every segment is a real
 * `<button>` primitive and carries its own `data-testid` so tests can click
 * them directly.
 */
export function Chips<T extends string>({
  value,
  onChange,
  options,
  testIdPrefix,
  ariaLabel,
  className = '',
}: ChipsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-full border border-rule bg-surface p-1 ${className}`}
      data-testid={testIdPrefix}
    >
      {options.map((opt) => {
        const active = value === opt.value
        const idSuffix = opt.testId ?? opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onChange(opt.value)
            }}
            data-testid={`${testIdPrefix}-${idSuffix}`}
            className={`rounded-full px-3 py-1.5 font-sans text-sm transition-colors ${active ? 'bg-ink text-paper font-medium' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
