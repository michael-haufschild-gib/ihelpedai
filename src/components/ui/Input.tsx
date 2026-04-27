import React, { useId, useState, useRef, useCallback } from 'react'
import { m, type HTMLMotionProps } from 'motion/react'
import { LoadingSpinner } from './LoadingSpinner'

/** Props for the Input component. */
export interface InputProps extends Omit<HTMLMotionProps<'input'>, 'ref'> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string | boolean
  loading?: boolean
  containerClassName?: string
  label?: string
}

const ERROR_BORDER =
  'border-danger-border focus:border-danger focus:ring-1 focus:ring-danger-border placeholder:text-danger/30'
const NORMAL_BORDER =
  'border-[var(--border-subtle)] focus:border-accent focus:ring-1 focus:ring-accent/50 placeholder:text-[var(--text-muted)]'

function buildInputClassName(args: {
  hasError: boolean
  hasLeftIcon: boolean
  hasRightSlot: boolean
  disabled: boolean
  extra: string
}): string {
  const { hasError, hasLeftIcon, hasRightSlot, disabled, extra } = args
  const base =
    'w-full bg-glass border rounded-lg px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:bg-[var(--bg-active)]'
  const padLeft = hasLeftIcon ? 'ps-9' : ''
  const padRight = hasRightSlot ? 'pe-9' : ''
  const border = hasError ? ERROR_BORDER : NORMAL_BORDER
  const interactive = disabled
    ? 'opacity-50 cursor-not-allowed'
    : 'hover:border-[var(--border-highlight)] hover:bg-[var(--bg-hover)]'
  return `${base} ${padLeft} ${padRight} ${border} ${interactive} ${extra}`.trim()
}

/** Animated error message below the input. */
function InputError({ error }: { error: string }) {
  return (
    <m.span initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-danger ml-1">
      {error}
    </m.span>
  )
}

/** Optional label rendered above the input, bound via htmlFor to inputId. */
function InputLabel({ htmlFor, text }: { htmlFor: string; text: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-text-secondary ms-1">
      {text}
    </label>
  )
}

/** Animated wrapper + left icon overlay for the input. */
function InputField({
  leftIcon,
  isFocused,
  hasError,
  children,
}: {
  leftIcon: React.ReactNode
  isFocused: boolean
  hasError: boolean
  children: React.ReactNode
}) {
  return (
    <m.div
      className={`relative flex items-center group transition-all duration-200 ${hasError ? 'animate-shake' : ''}`}
      animate={hasError ? { x: [-2, 2, -2, 2, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      {Boolean(leftIcon) && (
        <div className={`absolute start-3 transition-colors ${isFocused ? 'text-accent' : 'text-text-tertiary'}`}>
          {leftIcon}
        </div>
      )}
      {children}
    </m.div>
  )
}

/** Right-side adornments: loading spinner or static right icon. */
function InputAdornments({ loading, rightIcon }: { loading: boolean; rightIcon: React.ReactNode }) {
  const hasIcon = Boolean(rightIcon)
  if (!loading && !hasIcon) return null
  return (
    // `pointer-events-none`: the slot is decorative (spinner / static icon)
    // so clicks on the padded right edge should still land on the input
    // and move the caret there rather than hitting this overlay.
    <div className="pointer-events-none absolute right-3 flex items-center gap-2">
      {loading && <LoadingSpinner size={14} className="text-text-tertiary" />}
      {hasIcon && !loading && <div className="text-text-tertiary">{rightIcon}</div>}
    </div>
  )
}

/** Merge a callback ref with an optional forwarded ref. */
function composeInputRefs(
  inputRef: React.RefObject<HTMLInputElement | null>,
  forwarded: React.Ref<HTMLInputElement> | undefined,
): (el: HTMLInputElement | null) => void {
  return (el) => {
    inputRef.current = el
    if (typeof forwarded === 'function') forwarded(el)
    else if (forwarded && typeof forwarded === 'object') forwarded.current = el
  }
}

/** Text input with icon slots, error animation, and glass styling. */
export const Input = ({
  leftIcon,
  rightIcon,
  error,
  loading,
  className = '',
  containerClassName = '',
  label,
  disabled,
  value,
  onChange,
  type = 'text',
  id,
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) => {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fallbackId = useId()
  const inputId = id ?? `input-${fallbackId}`
  const setRefs = useCallback((el: HTMLInputElement | null) => composeInputRefs(inputRef, ref)(el), [ref])

  const hasError = error !== undefined && error !== false && error !== ''

  const inputClassName = buildInputClassName({
    hasError,
    hasLeftIcon: Boolean(leftIcon),
    hasRightSlot: Boolean(rightIcon) || loading === true,
    disabled: disabled === true,
    extra: className,
  })

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`} data-testid="input-container">
      {label && <InputLabel htmlFor={inputId} text={label} />}
      <InputField leftIcon={leftIcon} isFocused={isFocused} hasError={hasError}>
        <m.input
          ref={setRefs}
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled || loading}
          onFocus={(e) => {
            setIsFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            props.onBlur?.(e)
          }}
          className={inputClassName}
          {...props}
        />
        <InputAdornments loading={loading === true} rightIcon={rightIcon} />
      </InputField>
      {typeof error === 'string' && error !== '' && <InputError error={error} />}
    </div>
  )
}
