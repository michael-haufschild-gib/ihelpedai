/**
 * EditorTopBar Component
 * Top bar with left-panel toggle and View menu (theme/accent/motion).
 */

import type React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { useViewMenuItems } from '@/components/layout/useViewMenuItems'

function PanelLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}

function ChevronDownSmall() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export const EditorTopBar: React.FC = () => {
  const {
    leftPanelVisible,
    toggleLeftPanel,
    theme,
    setTheme,
    accent,
    setAccent,
    reducedMotion,
    setReducedMotion,
  } = useLayoutStore(
    useShallow((state: LayoutStore) => ({
      leftPanelVisible: state.showLeftPanel,
      toggleLeftPanel: state.toggleLeftPanel,
      theme: state.theme,
      setTheme: state.setTheme,
      accent: state.accent,
      setAccent: state.setAccent,
      reducedMotion: state.reducedMotion,
      setReducedMotion: state.setReducedMotion,
    }))
  )

  const viewItems = useViewMenuItems(
    theme,
    setTheme,
    accent,
    setAccent,
    reducedMotion,
    setReducedMotion
  )
  const isMobile = useIsMobile()

  const leftToggleClass = leftPanelVisible
    ? 'bg-accent/10 text-accent'
    : 'text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)]'

  return (
    <div
      className="glass-panel h-12 flex items-center px-4 z-40 shrink-0 select-none relative mb-2 rounded-xl mx-2 mt-2 pf-topbar"
      data-testid="top-bar"
      data-app-shell="bar"
    >
      <div className="flex items-center gap-4 shrink-0">
        <Button
          variant={leftPanelVisible && !isMobile ? 'primary' : 'ghost'}
          size="icon"
          onClick={toggleLeftPanel}
          ariaLabel="Toggle Navigation"
          data-testid="toggle-left-panel"
          className={`p-1.5 ${!isMobile ? leftToggleClass : 'text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)]'}`}
        >
          <PanelLeftIcon />
        </Button>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <DropdownMenu
            trigger={
              <span className="flex items-center gap-1" data-testid="menu-view">
                VIEW
                <ChevronDownSmall />
              </span>
            }
            className="btn btn-ghost btn-sm px-2 py-1 font-medium tracking-wide"
            items={viewItems}
          />
        </div>
      </div>

      <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center">
        <span
          className="text-xs font-bold text-text-secondary uppercase tracking-widest"
          data-testid="topbar-title"
        >
          ihelpedai
        </span>
      </div>
    </div>
  )
}
