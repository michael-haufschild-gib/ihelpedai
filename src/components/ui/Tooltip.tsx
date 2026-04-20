import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { sx } from '@/lib/sx'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'

/** Props for the Tooltip component. */
export interface TooltipProps {
  content: string | React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
  'data-testid'?: string
}

type Position = TooltipProps['position']

/** Compute tooltip coordinates relative to trigger, clamped to viewport. */
function computeTooltipCoords(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  position: Position
): { x: number; y: number } {
  let x = 0
  let y = 0

  switch (position) {
    case 'top':
      x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      y = triggerRect.top - tooltipRect.height - 8
      break
    case 'bottom':
      x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      y = triggerRect.bottom + 8
      break
    case 'left':
      x = triggerRect.left - tooltipRect.width - 8
      y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
      break
    case 'right':
      x = triggerRect.right + 8
      y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
      break
  }

  x = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, x))
  y = Math.max(8, Math.min(window.innerHeight - tooltipRect.height - 8, y))
  return { x, y }
}

/**
 * Positions a visible tooltip imperatively — writes left/top directly to the DOM node
 * on mount and on scroll/resize. Using style writes instead of setState avoids the
 * set-state-in-effect rule without sacrificing correctness.
 */
function useTooltipPosition(
  isVisible: boolean,
  triggerRef: React.RefObject<HTMLDivElement | null>,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
  position: Position
) {
  useLayoutEffect(() => {
    if (!isVisible) return
    const reposition = () => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip) return
      const { x, y } = computeTooltipCoords(
        trigger.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        position
      )
      tooltip.style.left = `${String(x)}px`
      tooltip.style.top = `${String(y)}px`
      tooltip.style.visibility = 'visible'
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [isVisible, position, triggerRef, tooltipRef])
}

/** Hover tooltip that portals to body and positions relative to the trigger. */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
  className = '',
  'data-testid': testId,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const { theme, accent } = useLayoutStore(
    useShallow((s: LayoutStore) => ({ theme: s.theme, accent: s.accent }))
  )
  useTooltipPosition(isVisible, triggerRef, tooltipRef, position)

  const showTooltip = () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    },
    []
  )

  return (
    <div className={`relative inline-block ${className}`} data-testid={testId ?? 'tooltip-wrapper'}>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <m.div
                ref={tooltipRef}
                data-app-theme
                data-mode={theme}
                data-accent={accent}
                initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="fixed z-50 px-3 py-1.5 text-2xs-plus font-medium text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-lg pointer-events-none max-w-xs break-words tracking-wide"
                style={sx({ left: 0, top: 0, visibility: 'hidden' as const })}
                role="tooltip"
              >
                {content}
              </m.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}
