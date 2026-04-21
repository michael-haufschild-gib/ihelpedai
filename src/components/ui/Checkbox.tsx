/** Props for the Checkbox component. */
export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

/** Styled checkbox input matching the design system. */
export function Checkbox({
  checked,
  onChange,
  disabled = false,
  className = '',
  'data-testid': dataTestId,
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      data-testid={dataTestId}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className={`h-4 w-4 cursor-pointer rounded border border-border-default accent-accent ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
    />
  )
}
