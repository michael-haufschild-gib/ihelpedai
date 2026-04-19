import { soundManager } from '@/lib/audio/SoundManager'
import { AnimatePresence, m } from 'motion/react'
import type React from 'react'
import { useState } from 'react'

/** Props for the ControlGroup component. */
export interface ControlGroupProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  collapsible?: boolean
  className?: string
  rightElement?: React.ReactNode
  'data-testid'?: string
}

/** Collapsible section header with chevron indicator. */
function GroupHeader({
  title,
  collapsible,
  isOpen,
  rightElement,
  onToggle,
}: {
  title: string
  collapsible: boolean
  isOpen: boolean
  rightElement?: React.ReactNode
  onToggle: () => void
}) {
  return (
    <div
      data-testid="control-group-toggle"
      role={collapsible ? 'button' : undefined}
      tabIndex={collapsible ? 0 : undefined}
      aria-expanded={collapsible ? isOpen : undefined}
      className={`flex items-center justify-between py-1.5 ${collapsible ? 'cursor-pointer hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50 focus:ring-inset' : ''}`}
      onClick={onToggle}
      onMouseEnter={() => {
        if (collapsible) soundManager.playHover()
      }}
      onKeyDown={(e) => {
        if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="flex items-center gap-2">
        {collapsible && (
          <m.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-text-tertiary"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </m.div>
        )}
        <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
          {title}
        </span>
      </div>
      {Boolean(rightElement) && (
        <div data-testid="control-group-stop-propagation" onClick={(e) => e.stopPropagation()}>
          {rightElement}
        </div>
      )}
    </div>
  )
}

/** Collapsible section with animated expand/collapse and a left border for nested content. */
export const ControlGroup: React.FC<ControlGroupProps> = ({
  title,
  children,
  defaultOpen = true,
  collapsible = false,
  className = '',
  rightElement,
  'data-testid': testId,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const toggle = () => {
    if (collapsible) {
      setIsOpen(!isOpen)
      soundManager.playClick()
    }
  }

  const showTitle = collapsible || title.trim() !== ''

  return (
    <div
      className={`border-b border-[var(--border-subtle)] pb-2 pt-3 first:pt-0 last:border-0 ${className}`}
      data-testid={testId}
    >
      {showTitle && (
        <GroupHeader
          title={title}
          collapsible={collapsible}
          isOpen={isOpen}
          rightElement={rightElement}
          onToggle={toggle}
        />
      )}
      <AnimatePresence initial={false}>
        {(isOpen || !collapsible) && (
          <m.div
            initial={collapsible ? { height: 0, opacity: 0 } : undefined}
            animate={collapsible ? { height: 'auto', opacity: 1 } : undefined}
            exit={collapsible ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-1">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
