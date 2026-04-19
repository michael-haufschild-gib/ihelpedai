import { m as MotionEl } from 'motion/react'

/** A single option within a MultiToggleGroup. */
export interface MultiToggleOption<T extends string = string> {
  value: T
  label: string
}

/** Props for the MultiToggleGroup component. */
export interface MultiToggleGroupProps<T extends string = string> {
  options: MultiToggleOption<T>[]
  value: T[]
  onChange: (value: T[]) => void
  label?: string
  className?: string
  disabled?: boolean
  ariaLabel?: string
  'data-testid'?: string
}

export const MultiToggleGroup = <T extends string = string>({
  options,
  value,
  onChange,
  label,
  className = '',
  disabled = false,
  ariaLabel,
  'data-testid': testId,
}: MultiToggleGroupProps<T>) => {
  const handleToggle = (optionValue: T) => {
    if (disabled) return

    const isSelected = value.includes(optionValue)
    if (isSelected) {
      onChange(value.filter((v) => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-text-secondary mb-2">{label}</label>
      )}
      <div
        className="flex flex-wrap gap-1 p-1 bg-[var(--bg-hover)] rounded-lg"
        role="group"
        aria-label={ariaLabel || label}
        data-testid={testId}
      >
        {options.map((option) => {
          const isSelected = value.includes(option.value)
          return (
            <MotionEl.button
              key={option.value}
              onClick={() => {
                handleToggle(option.value)
              }}
              disabled={disabled}
              className={`
                relative px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-300 border
                cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  isSelected
                    ? 'bg-accent/20 text-accent border-accent/50 shadow-[0_0_10px_color-mix(in_oklch,var(--color-accent)_20%,transparent)]'
                    : 'bg-[var(--bg-hover)] text-text-secondary border-border-default hover:text-text-primary hover:bg-[var(--bg-active)]'
                }
              `}
              role="checkbox"
              aria-checked={isSelected}
              data-testid={testId ? `${testId}-${option.value}` : undefined}
            >
              <span className="relative z-10">{option.label}</span>
            </MotionEl.button>
          )
        })}
      </div>
    </div>
  )
}
