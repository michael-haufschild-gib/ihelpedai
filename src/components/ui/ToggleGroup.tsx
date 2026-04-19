import { m } from 'motion/react'
import { sx } from '@/lib/sx'
import { soundManager } from '@/lib/audio/SoundManager'

/** Single option in a ToggleGroup. */
export interface ToggleOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

/** Props for the ToggleGroup component. */
export interface ToggleGroupProps<T extends string = string> {
  options: ToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
  ariaLabel?: string
  'data-testid'?: string
}

/** Toggle button group with animated sliding active indicator. */
export const ToggleGroup = <T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  disabled = false,
  ariaLabel,
  'data-testid': testId,
}: ToggleGroupProps<T>) => {
  const selectedIndex = options.findIndex((o) => o.value === value)
  const count = options.length

  return (
    <div
      className={`relative flex p-1 gap-1 glass-input rounded-lg border border-(--border-subtle) ${className}`}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {/* Sliding indicator — always mounted, positioned via transform */}
      {selectedIndex >= 0 && (
        <m.div
          className="absolute top-1 bottom-1 border rounded-md pointer-events-none"
          style={sx({
            backgroundColor: 'var(--accent-subtle)',
            borderColor: 'var(--accent-muted)',
          })}
          animate={{
            left: `calc(${selectedIndex} * (100% / ${count}) + 4px)`,
            width: `calc(100% / ${count} - 8px)`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}

      {options.map((option) => {
        const isSelected = option.value === value
        const isDisabled = disabled || option.disabled
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (!isDisabled && !isSelected) {
                onChange(option.value)
                soundManager.playClick()
              }
            }}
            onMouseEnter={() => {
              if (!isSelected && !isDisabled) soundManager.playHover()
            }}
            disabled={isDisabled}
            className={`flex-1 relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 z-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isSelected ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            role="radio"
            aria-checked={isSelected}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
