import React, { useId } from 'react'

/** Props for the Textarea component. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | boolean
  containerClassName?: string
  label?: string
}

const ERROR_BORDER =
  'border-danger-border focus:border-danger focus:ring-1 focus:ring-danger-border placeholder:text-danger/30'
const NORMAL_BORDER =
  'border-[var(--border-subtle)] focus:border-accent focus:ring-1 focus:ring-accent/50 placeholder:text-[var(--text-muted)]'

function buildTextareaClassName(args: {
  hasError: boolean
  disabled: boolean
  extra: string
}): string {
  const { hasError, disabled, extra } = args
  const base =
    'w-full bg-glass border rounded-lg px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:bg-[var(--bg-active)] resize-y'
  const border = hasError ? ERROR_BORDER : NORMAL_BORDER
  const interactive = disabled
    ? 'opacity-50 cursor-not-allowed'
    : 'hover:border-[var(--border-highlight)] hover:bg-[var(--bg-hover)]'
  return `${base} ${border} ${interactive} ${extra}`.trim()
}

/** Multi-line text input matching Input's glass styling and error state. */
export const Textarea = ({
  error,
  className = '',
  containerClassName = '',
  label,
  disabled,
  ref,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: TextareaProps & { ref?: React.Ref<HTMLTextAreaElement> }) => {
  const hasError = error !== undefined && error !== false && error !== ''
  const fallbackId = useId()
  const textareaId = id ?? `textarea-${fallbackId}`
  const errorId = typeof error === 'string' && error !== '' ? `${textareaId}-error` : undefined
  const describedByTokens = [ariaDescribedBy, errorId].filter(
    (v): v is string => typeof v === 'string' && v !== '',
  )
  const describedBy = describedByTokens.length > 0 ? describedByTokens.join(' ') : undefined
  const textareaClassName = buildTextareaClassName({
    hasError,
    disabled: disabled === true,
    extra: className,
  })

  return (
    <div
      className={`flex flex-col gap-1.5 ${containerClassName}`}
      data-testid="textarea-container"
    >
      {label !== undefined && label !== '' && (
        <label htmlFor={textareaId} className="text-xs font-medium text-text-secondary ms-1">
          {label}
        </label>
      )}
      <textarea
        data-testid="textarea"
        ref={ref}
        id={textareaId}
        aria-invalid={hasError ? true : ariaInvalid}
        aria-describedby={describedBy}
        disabled={disabled}
        className={textareaClassName}
        {...props}
      />
      {typeof error === 'string' && error !== '' && (
        <span id={errorId} className="text-xs text-danger ms-1">
          {error}
        </span>
      )}
    </div>
  )
}
