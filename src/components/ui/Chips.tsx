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
  /** Required accessible name for the radiogroup. */
  ariaLabel: string
  className?: string
}

/**
 * Pill-style segmented control for short filter / sort choices. Matches the
 * Feed design's "All deeds / Most recent" pattern. Every segment is a real
 * `<button>` primitive and carries its own `data-testid` so tests can click
 * them directly. Implements the WAI-ARIA radiogroup pattern: roving tabindex
 * and arrow/Home/End navigation between segments.
 */
export function Chips<T extends string>({
  value,
  onChange,
  options,
  testIdPrefix,
  ariaLabel,
  className = '',
}: ChipsProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const selectByIndex = (nextIndex: number): void => {
    if (options.length === 0) return
    const safe = ((nextIndex % options.length) + options.length) % options.length
    const next = options[safe].value
    if (next !== value) onChange(next)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-full border border-rule bg-surface p-1 ${className}`}
      data-testid={testIdPrefix}
    >
      {options.map((opt, index) => {
        const active = value === opt.value
        const idSuffix = opt.testId ?? opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!active) onChange(opt.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                selectByIndex(selectedIndex + 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                selectByIndex(selectedIndex - 1)
              } else if (e.key === 'Home') {
                e.preventDefault()
                selectByIndex(0)
              } else if (e.key === 'End') {
                e.preventDefault()
                selectByIndex(options.length - 1)
              }
            }}
            data-index={index}
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
