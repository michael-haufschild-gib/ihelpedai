import type React from 'react'
import { m } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'

/** Props for the TabButton component. */
interface TabButtonProps {
  tab: { id: string; label: React.ReactNode }
  isActive: boolean
  instanceId: string
  variant: 'default' | 'minimal' | 'pills'
  fullWidth: boolean
  testId?: string
  onSelect: (id: string) => void
  onKeyDown: (e: React.KeyboardEvent, index: number) => void
  index: number
  buttonRef: (el: HTMLButtonElement | null) => void
}

/** Individual tab button with animated active indicator. */
export const TabButton: React.FC<TabButtonProps> = ({
  tab,
  isActive,
  instanceId,
  variant,
  fullWidth,
  testId,
  onSelect,
  onKeyDown,
  index,
  buttonRef,
}) => (
  <m.button
    ref={buttonRef}
    type="button"
    role="tab"
    id={`${instanceId}-tab-${tab.id}`}
    aria-selected={isActive}
    aria-controls={`${instanceId}-panel-${tab.id}`}
    tabIndex={isActive ? 0 : -1}
    onClick={() => {
      if (!isActive) soundManager.playClick()
      onSelect(tab.id)
    }}
    onMouseEnter={() => {
      if (!isActive) soundManager.playHover()
    }}
    onKeyDown={(e) => onKeyDown(e, index)}
    className={`relative px-4 py-2 text-[10px] uppercase tracking-widest font-bold whitespace-nowrap select-none transition-colors duration-200 cursor-pointer outline-none focus:outline-none focus-visible:outline-none border-none focus:ring-0 ${fullWidth ? 'flex-1' : ''} ${isActive ? 'text-accent text-glow-subtle' : 'text-text-secondary hover:text-text-primary'} ${variant === 'pills' && isActive ? 'bg-[var(--bg-active)] rounded shadow-sm' : ''} ${variant === 'pills' && !isActive ? 'hover:bg-[var(--bg-hover)] rounded' : ''}`}
    data-testid={testId ? `${testId}-tab-${tab.id}` : undefined}
  >
    {isActive && variant !== 'pills' && (
      <m.div
        layoutId={`activeTab-${instanceId}`}
        className="absolute bottom-[-1px] inset-inline-0 h-[2px] bg-accent shadow-[0_0_8px_var(--color-accent)]"
        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
      />
    )}
    {isActive && variant !== 'pills' && (
      <div className="absolute inset-0 bg-gradient-to-t from-accent/5 to-transparent pointer-events-none" />
    )}
    <span className="relative z-10">{tab.label}</span>
  </m.button>
)
