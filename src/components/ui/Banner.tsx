import React, { memo } from 'react'
import { Button } from './Button'

/** Props for the {@link Banner} component. */
export interface BannerProps {
  /** Banner visual style. */
  variant?: 'info' | 'warning' | 'error'
  /** Main text content. */
  children: React.ReactNode
  /** Optional action button label. When set, renders a dismiss/action button. */
  actionLabel?: string
  /** Called when the action button is clicked. */
  onAction?: () => void
  'data-testid'?: string
}

const variantClasses: Record<NonNullable<BannerProps['variant']>, string> = {
  info: 'banner-info',
  warning: 'banner-warning',
  error: 'banner-error',
}

/** Inline notification banner with optional action button. */
function BannerComponent({
  variant = 'info',
  children,
  actionLabel,
  onAction,
  'data-testid': testId,
}: BannerProps) {
  // Errors and warnings are announced assertively; info is polite.
  const role = variant === 'info' ? 'status' : 'alert'
  return (
    <div className={`banner ${variantClasses[variant]}`} role={role} data-testid={testId}>
      <span className="banner-text">{children}</span>
      {actionLabel && onAction && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onAction}
          data-testid={testId ? `${testId}-action` : undefined}
        >
          {actionLabel}
          <span aria-hidden="true">&times;</span>
        </Button>
      )}
    </div>
  )
}

export const Banner = memo(BannerComponent)
