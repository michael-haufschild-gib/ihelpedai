/**
 * Tabs Component
 * Reusable tab component with keep-alive and mount-on-demand for tab content.
 */

import type React from 'react'
import { useCallback, useId, useRef, useState } from 'react'
import { useTabsScroll } from './useTabsScroll'
import { TabScrollButton } from './TabScrollButton'
import { TabButton } from './TabButton'

/** Single tab definition. */
export interface Tab {
  id: string
  label: React.ReactNode
  content: React.ReactNode
}

/** Props for the Tabs component. */
export interface TabsProps {
  tabs: Tab[]
  value: string
  onChange: (id: string) => void
  className?: string
  tabListClassName?: string
  contentClassName?: string
  variant?: 'default' | 'minimal' | 'pills'
  fullWidth?: boolean
  'data-testid'?: string
}

/** Returns the next tab index for keyboard navigation. */
function resolveKeyboardIndex(key: string, current: number, total: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return current === 0 ? total - 1 : current - 1
    case 'ArrowRight':
      return current === total - 1 ? 0 : current + 1
    case 'Home':
      return 0
    case 'End':
      return total - 1
    default:
      return null
  }
}

/** Scrollable tab header with keyboard navigation. */
function TabListHeader({
  tabs,
  value,
  instanceId,
  variant,
  fullWidth,
  testId,
  tabsRef,
  onTabChange,
}: {
  tabs: Tab[]
  value: string
  instanceId: string
  variant: 'default' | 'minimal' | 'pills'
  fullWidth: boolean
  testId: string | undefined
  tabsRef: React.RefObject<(HTMLButtonElement | null)[]>
  onTabChange: (id: string) => void
}) {
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useTabsScroll()

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      const newIndex = resolveKeyboardIndex(event.key, index, tabs.length)
      if (newIndex === null) return
      event.preventDefault()
      const target = tabs[newIndex]
      if (target !== undefined) {
        onTabChange(target.id)
        tabsRef.current[newIndex]?.focus()
      }
    },
    [tabs, onTabChange, tabsRef]
  )

  const listStyles =
    variant === 'pills'
      ? 'bg-[var(--bg-hover)] rounded-lg p-1 gap-1'
      : 'border-b border-border-subtle pb-[1px]'

  return (
    <div className="relative">
      {canScrollLeft && <TabScrollButton direction="left" onClick={() => scroll('left')} />}
      <div
        ref={scrollContainerRef}
        className={`overflow-x-auto scrollbar-none ${fullWidth ? 'w-full' : ''}`}
      >
        <div
          className={`flex items-center ${listStyles} ${fullWidth ? 'w-full min-w-max' : 'min-w-full w-max'}`}
          role="tablist"
        >
          {tabs.map((tab, i) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === value}
              instanceId={instanceId}
              variant={variant}
              fullWidth={fullWidth}
              testId={testId}
              onSelect={onTabChange}
              onKeyDown={handleKeyDown}
              index={i}
              buttonRef={(el) => {
                tabsRef.current[i] = el
              }}
            />
          ))}
        </div>
      </div>
      {canScrollRight && <TabScrollButton direction="right" onClick={() => scroll('right')} />}
    </div>
  )
}

/** Tabs component with scrollable header, keep-alive panels, and animated indicator. */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  value,
  onChange,
  className = '',
  tabListClassName = '',
  contentClassName = '',
  variant = 'default',
  fullWidth = false,
  'data-testid': testId,
}) => {
  const instanceId = useId()
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set([value]))

  const ensureMounted = useCallback((id: string) => {
    setMountedTabs((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const handleTabChange = useCallback(
    (id: string) => {
      ensureMounted(id)
      if (id !== value) onChange(id)
    },
    [value, onChange, ensureMounted]
  )

  // Always include the current value synchronously so an externally-controlled
  // value change (parent drives `value` without calling handleTabChange) still
  // renders the target panel on the same frame. If the user clicks back to a
  // previously-mounted tab, mountedTabs keeps its DOM alive; externally-driven
  // transient flips don't persist, which is the acceptable tradeoff here.
  const visibleMounted = mountedTabs.has(value)
    ? mountedTabs
    : new Set<string>([...mountedTabs, value])

  return (
    <div className={`flex flex-col ${className}`} data-testid={testId}>
      <div className={`shrink-0 z-10 ${tabListClassName}`}>
        <TabListHeader
          tabs={tabs}
          value={value}
          instanceId={instanceId}
          variant={variant}
          fullWidth={fullWidth}
          testId={testId}
          tabsRef={tabsRef}
          onTabChange={handleTabChange}
        />
      </div>
      <div className={`flex-1 min-h-0 relative overflow-y-auto scrollbar-none ${contentClassName}`}>
        {tabs.map((tab) =>
          visibleMounted.has(tab.id) ? (
            <div
              key={tab.id}
              id={`${instanceId}-panel-${tab.id}`}
              className={`w-full h-full ${tab.id === value ? 'block animate-fade-in' : 'hidden'}`}
              role="tabpanel"
              aria-labelledby={`${instanceId}-tab-${tab.id}`}
              data-testid={testId ? `${testId}-panel-${tab.id}` : undefined}
            >
              {tab.content}
            </div>
          ) : null
        )}
      </div>
    </div>
  )
}
