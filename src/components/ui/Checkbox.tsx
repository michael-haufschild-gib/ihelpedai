import type { InputHTMLAttributes } from 'react'

/** Props for the Checkbox component. */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean
  onChange: (checked: boolean) => void
  'data-testid'?: string
}

/** Styled checkbox input matching the design system. */
export function Checkbox({
  checked,
  onChange,
  disabled = false,
  className = '',
  'data-testid': dataTestId,
  ...rest
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      data-testid={dataTestId}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className={`h-4 w-4 cursor-pointer rounded border border-border-default accent-accent ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
      {...rest}
    />
  )
}
