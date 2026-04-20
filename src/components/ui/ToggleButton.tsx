import React from 'react'
import { soundManager } from '@/lib/audio/SoundManager'
import { m as MotionEl, type HTMLMotionProps } from 'motion/react'

/** Props for the ToggleButton component with sound feedback. */
export interface ToggleButtonProps extends Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'onToggle'
> {
  pressed: boolean
  onToggle: (pressed: boolean) => void
  ariaLabel: string
  className?: string
  children: React.ReactNode
  /** Sound to play on click: 'click' (default) or 'swish' (for opening drawers/panels) */
  sound?: 'click' | 'swish'
}

export const ToggleButton = ({
  pressed,
  onToggle,
  ariaLabel,
  className = '',
  children,
  sound = 'click',
  ref,
  ...props
}: ToggleButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => {
  const handleClick = () => {
    if (sound === 'swish') {
      if (!pressed) soundManager.playSwish()
      else soundManager.playClick()
    } else {
      soundManager.playClick()
    }
    onToggle(!pressed)
  }

  return (
    <MotionEl.button
      data-testid="toggle-button-click"
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={handleClick}
      onMouseEnter={() => {
        soundManager.playHover()
      }}
      className={`
          px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300 border
          ${
            pressed
              ? 'bg-accent/20 text-accent border-accent/50 shadow-accent'
              : 'bg-[var(--bg-hover)] text-text-secondary border-border-default hover:text-text-primary hover:bg-[var(--bg-active)]'
          }
          ${className}
        `}
      aria-label={ariaLabel}
      {...(props as unknown as HTMLMotionProps<'button'>)}
    >
      {children}
    </MotionEl.button>
  )
}
