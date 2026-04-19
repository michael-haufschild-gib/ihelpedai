import React, { useState, useRef, useEffect, useCallback } from 'react'
import { m, type HTMLMotionProps } from 'motion/react'
import { LoadingSpinner } from './LoadingSpinner'
import { soundManager } from '@/lib/audio/SoundManager'
import { InputClearButton } from './InputClearButton'
import { clearInputValue } from './inputHelpers'

/** Props for the Input component. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string | boolean
  loading?: boolean
  clearable?: boolean
  onClear?: () => void
  containerClassName?: string
  label?: string
}

/** Text input with icon slots, clearable state, error animation, and glass styling. */
export const Input = ({
  leftIcon,
  rightIcon,
  error,
  loading,
  clearable,
  onClear,
  className = '',
  containerClassName = '',
  label,
  disabled,
  value,
  onChange,
  type = 'text',
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) => {
  const [isFocused, setIsFocused] = useState(false)
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref && typeof ref === 'object') ref.current = el
    },
    [ref]
  )

  const hasError = error !== undefined && error !== false && error !== ''
  useEffect(() => {
    if (hasError) soundManager.playSnap()
  }, [hasError])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) setUncontrolledHasValue(e.target.value.length > 0)
    onChange?.(e)
  }

  const handleClear = () => {
    if (inputRef.current) {
      clearInputValue(inputRef.current, onChange, onClear)
      if (value === undefined) setUncontrolledHasValue(false)
    }
  }

  const hasValue = value !== undefined ? String(value).length > 0 : uncontrolledHasValue

  const errorBorder =
    'border-danger-border focus:border-danger focus:ring-1 focus:ring-danger-border placeholder:text-danger/30'
  const normalBorder =
    'border-[var(--border-subtle)] focus:border-accent focus:ring-1 focus:ring-accent/50 placeholder:text-[var(--text-muted)]'

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`} data-testid="input-container">
      {label && <label className="text-xs font-medium text-text-secondary ms-1">{label}</label>}
      <m.div
        className={`relative flex items-center group transition-all duration-200 ${hasError ? 'animate-shake' : ''}`}
        animate={hasError ? { x: [-2, 2, -2, 2, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {Boolean(leftIcon) && (
          <div
            className={`absolute start-3 transition-colors ${isFocused ? 'text-accent' : 'text-text-tertiary'}`}
          >
            {leftIcon}
          </div>
        )}
        <m.input
          ref={setRefs}
          type={type}
          value={value}
          onChange={handleInputChange}
          disabled={disabled || loading}
          onFocus={(e) => {
            setIsFocused(true)
            soundManager.playHover()
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            props.onBlur?.(e)
          }}
          className={`w-full bg-glass border rounded-lg px-3 py-2 text-sm transition-all duration-200 ${leftIcon != null ? 'ps-9' : ''} ${rightIcon != null || clearable === true || loading === true ? 'pe-9' : ''} ${hasError ? errorBorder : normalBorder} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--border-highlight)] hover:bg-[var(--bg-hover)]'} focus:outline-none focus:bg-[var(--bg-active)] ${className}`}
          {...(props as unknown as HTMLMotionProps<'input'>)}
        />
        <div className="absolute right-3 flex items-center gap-2">
          {loading ? (
            <LoadingSpinner size={14} className="text-text-tertiary" />
          ) : (
            <InputClearButton
              visible={Boolean(clearable) && hasValue && !disabled}
              onClick={handleClear}
            />
          )}
          {Boolean(rightIcon) && !loading && <div className="text-text-tertiary">{rightIcon}</div>}
        </div>
      </m.div>
      {typeof error === 'string' && error !== '' && (
        <m.span
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-danger ml-1"
        >
          {error}
        </m.span>
      )}
    </div>
  )
}
