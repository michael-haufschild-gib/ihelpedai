import React from 'react'
import { m as MotionEl } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Single option in a Select dropdown. */
export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

/** Props for the Select component. */
export interface SelectProps<T extends string = string> {
  label?: string
  options: SelectOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
  'data-testid'?: string
}

export const Select = <T extends string = string>({
  label,
  options,
  value,
  onChange,
  className = '',
  disabled = false,
  'data-testid': testId,
}: SelectProps<T>) => {
  const selectId = React.useId()

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-text-secondary ms-1">
          {label}
        </label>
      )}
      <div className="relative group">
        <MotionEl.select
          id={selectId}
          value={value}
          onChange={(e) => {
            onChange(e.target.value as T)
          }}
          onMouseEnter={() => {
            if (!disabled) soundManager.playHover()
          }}
          disabled={disabled}
          data-testid={testId}
          className="glass-input w-full ps-3 pe-8 py-2 text-sm text-[var(--text-primary)] rounded-lg appearance-none cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)] transition-colors"
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-background text-text-primary"
            >
              {option.label}
            </option>
          ))}
        </MotionEl.select>
        <div className="absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-200 group-hover:translate-y-[-40%]">
          <svg
            className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  )
}
