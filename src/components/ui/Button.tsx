import React, { useRef, useState, useEffect } from 'react'
import { m, type HTMLMotionProps } from 'motion/react'
import { LoadingSpinner } from './LoadingSpinner'
import { soundManager } from '@/lib/audio/SoundManager'
import { sx } from '@/lib/sx'

/** Props for the Button component. */
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  children: React.ReactNode
  ref?: React.Ref<HTMLButtonElement>
  disabled?: boolean
  loading?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
  'data-testid'?: string
  glow?: boolean
}

/** Manages ripple animation state for button click feedback. */
function useRipples() {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([])
  const timersRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const spawn = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ripple = { x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() }
    setRipples((prev) => [...prev, ripple])
    const timer = window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== ripple.id))
      timersRef.current.delete(timer)
    }, 600)
    timersRef.current.add(timer)
  }

  return { ripples, spawn }
}

/** Animated button with ripple feedback, loading overlay, and variant styling. */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  ref,
  onClick,
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  ariaLabel,
  'data-testid': testId,
  glow = false,
  ...props
}: ButtonProps) {
  const { ripples, spawn } = useRipples()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return
    soundManager.playClick()
    spawn(e)
    onClick?.(e)
  }

  const glowClass = glow ? 'shadow-[0_0_15px_var(--theme-accent)]' : ''

  return (
    <m.button
      ref={ref}
      type={type}
      onClick={handleClick}
      onMouseEnter={() => {
        if (!disabled && !loading) soundManager.playHover()
      }}
      disabled={disabled || loading}
      className={`btn btn-${variant} btn-${size} ${glowClass} ${className}`}
      aria-label={ariaLabel}
      data-testid={testId}
      whileHover={!disabled && !loading ? { scale: 1.02 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.98 } : undefined}
      {...props}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-inherit backdrop-blur-[1px] z-20 rounded-[inherit]">
          <LoadingSpinner size={size === 'sm' ? 12 : 16} />
        </div>
      )}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute rounded-full bg-[var(--text-primary)]/10 animate-ping pointer-events-none"
          style={sx({
            left: r.x,
            top: r.y,
            width: '20px',
            height: '20px',
            transform: 'translate(-50%, -50%)',
            animationDuration: '0.6s',
          })}
        />
      ))}
      <div
        className={`flex items-center justify-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity relative z-10`}
      >
        {children}
      </div>
    </m.button>
  )
}
