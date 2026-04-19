import type React from 'react'
import { useCallback, useRef } from 'react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Props for the Slider component. */
export interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  /** Unit suffix displayed after the value (e.g. 'ms', 'px'). */
  unit?: string
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

/** Range slider with numeric input, track fill, and optional label/unit. */
export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit,
  disabled = false,
  className = '',
  'data-testid': dataTestId,
}) => {
  const hasPlayedSoundRef = useRef(false)

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100

  const handleRangeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!hasPlayedSoundRef.current) {
        soundManager.playHover()
        hasPlayedSoundRef.current = true
      }
      onChange(Number(e.target.value))
    },
    [onChange]
  )

  const handleRangeEnd = useCallback(() => {
    hasPlayedSoundRef.current = false
  }, [])

  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(e.target.value)
      if (!Number.isNaN(parsed)) {
        onChange(Math.max(min, Math.min(max, parsed)))
      }
    },
    [onChange, min, max]
  )

  return (
    <div
      className={`flex flex-col gap-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
      data-testid={dataTestId}
    >
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">{label}</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={value}
              onChange={handleNumberChange}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              data-testid={dataTestId ? `${dataTestId}-number` : 'slider-number'}
              className="w-16 h-6 text-xs text-center border border-(--border-subtle) bg-glass text-text-primary rounded px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:border-accent"
              aria-label={label != null ? `${label} value` : 'Slider value'}
            />
            {unit != null && <span className="text-[10px] text-text-tertiary">{unit}</span>}
          </div>
        </div>
      )}
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-(--bg-surface) border border-(--border-subtle)">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent/60"
            style={{ width: `${percent}%` }}
          />
        </div>
        <input
          type="range"
          value={value}
          onChange={handleRangeChange}
          onPointerUp={handleRangeEnd}
          onPointerLeave={handleRangeEnd}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          data-testid={dataTestId ? `${dataTestId}-range` : 'slider-range'}
          className="absolute inset-x-0 w-full h-5 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-(--theme-accent) [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-(--theme-accent) [&::-moz-range-thumb]:shadow-sm"
          aria-label={label ?? 'Slider'}
        />
      </div>
    </div>
  )
}
