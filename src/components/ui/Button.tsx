import React, { useRef, useState, useEffect } from 'react'
import { m, type HTMLMotionProps } from 'motion/react'
import { LoadingSpinner } from './LoadingSpinner'
import { sx } from '@/lib/sx'

/** Props for the Button component. */
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  /**
   * Visual variant. Use `'unstyled'` when the caller (e.g. a segmented
   * control) supplies its own classes — it skips the `btn btn-{variant}`
   * stack but keeps the ripple + disabled + loading + ARIA pass-through
   * behaviour that makes Button the consistent click target everywhere.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'unstyled'
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
  const nextIdRef = useRef(0)

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const spawn = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const id = nextIdRef.current
    nextIdRef.current += 1
    const ripple = { x: e.clientX - rect.left, y: e.clientY - rect.top, id }
    setRipples((prev) => [...prev, ripple])
    const timer = window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id))
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
    spawn(e)
    onClick?.(e)
  }

  const glowClass = glow ? 'shadow-accent-lg' : ''
  // `unstyled` skips the variant + size class stack so the caller's className
  // becomes the entire visual treatment. Useful for segmented controls and
  // chips that need pill styling distinct from the standard btn variants.
  // `relative overflow-hidden` has to stay on both variants though — the
  // absolute-positioned loader overlay and ripple spans depend on it for
  // correct containment; dropping them lets ripples paint outside the
  // button's bounds.
  const structural = 'relative overflow-hidden'
  const variantClasses = variant === 'unstyled' ? '' : `btn btn-${variant} btn-${size}`
  const composedClassName = `${structural} ${variantClasses} ${glowClass} ${className}`.trim()

  return (
    <m.button
      ref={ref}
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      className={composedClassName}
      aria-label={ariaLabel}
      data-testid={testId}
      whileHover={!disabled && !loading ? { scale: 1.02 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.98 } : undefined}
      {...props}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-inherit backdrop-blur-xs z-20 rounded-[inherit]">
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
