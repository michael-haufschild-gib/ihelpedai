import type React from 'react'
import { m } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Props for the Switch toggle component. */
export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
  iconOn?: React.ReactNode
  iconOff?: React.ReactNode
  'data-testid'?: string
}

/** Animated toggle thumb with optional icon overlays. */
function SwitchThumb({
  checked,
  iconOn,
  iconOff,
}: Pick<SwitchProps, 'checked' | 'iconOn' | 'iconOff'>) {
  return (
    <m.div
      initial={false}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      animate={{ x: checked ? 22 : 2 }}
      className={`absolute top-0.5 left-0 w-5 h-5 rounded-full shadow-md z-10 flex items-center justify-center overflow-hidden transition-colors duration-200 pointer-events-none ${checked ? 'bg-white' : 'bg-text-secondary group-hover/switch:bg-text-primary'}`}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {Boolean(iconOn) && (
          <m.div
            initial={false}
            animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
            className="absolute text-accent text-[10px]"
          >
            {iconOn}
          </m.div>
        )}
        {Boolean(iconOff) && (
          <m.div
            initial={false}
            animate={{ opacity: checked ? 0 : 1, scale: checked ? 0.5 : 1 }}
            className="absolute text-background text-[10px]"
          >
            {iconOff}
          </m.div>
        )}
      </div>
    </m.div>
  )
}

/** Toggle switch with spring-animated thumb, track glow, and optional label. */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className = '',
  iconOn,
  iconOff,
  'data-testid': dataTestId,
}) => {
  const trackClass = checked
    ? 'bg-[var(--theme-accent)] border-[var(--theme-accent)] shadow-[0_0_15px_var(--theme-accent-glow)]'
    : 'bg-[var(--bg-surface)] border-[var(--border-default)] group-hover/switch:bg-[var(--bg-hover)]'

  return (
    <label
      className={`flex items-center gap-3 cursor-pointer select-none group/switch relative ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onMouseEnter={() => {
        if (!disabled) soundManager.playHover()
      }}
      data-testid={dataTestId}
    >
      <div className="relative isolate w-11 h-6">
        <m.input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => {
            if (!disabled) {
              onCheckedChange(e.target.checked)
              soundManager.playClick()
            }
          }}
          disabled={disabled}
          role="switch"
          aria-checked={checked}
        />
        <div
          className={`absolute inset-0 rounded-full border transition-all duration-300 ease-out ${trackClass}`}
        />
        <SwitchThumb checked={checked} iconOn={iconOn} iconOff={iconOff} />
      </div>
      {label && (
        <span className="text-xs font-medium text-text-secondary group-hover/switch:text-text-primary transition-colors tracking-wide">
          {label}
        </span>
      )}
    </label>
  )
}
