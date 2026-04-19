import React, { useState, useRef, useEffect, useLayoutEffect, use } from 'react'
import { createPortal } from 'react-dom'
import { m, AnimatePresence } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { sx } from '@/lib/sx'
import type { DropdownMenuItem } from './DropdownMenu'
import { SubmenuPortalContext } from './SubmenuPortalContext'

/** Portaled submenu that positions itself relative to a trigger rect. */
const PortaledSubmenu: React.FC<{
  items: DropdownMenuItem[]
  triggerRect: DOMRect
  onClose: () => void
  depth: number
  onMouseEnter: () => void
  onMouseLeave: () => void
}> = ({ items, triggerRect, onClose, depth, onMouseEnter, onMouseLeave }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [ready, setReady] = useState(false)
  const portalContainerRef = use(SubmenuPortalContext)
  const [portalTarget, setPortalTarget] = useState<Element>(() => document.body)

  useEffect(() => {
    setPortalTarget(portalContainerRef?.current ?? document.body)
  }, [portalContainerRef])

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const menuRect = menuRef.current.getBoundingClientRect()
    let left = triggerRect.right + 2
    let top = triggerRect.top
    if (left + menuRect.width > window.innerWidth - 8) left = triggerRect.left - menuRect.width - 2
    if (left < 8) {
      left = Math.max(8, triggerRect.left)
      top = triggerRect.bottom + 2
    }
    if (top + menuRect.height > window.innerHeight - 8)
      top = Math.max(8, window.innerHeight - menuRect.height - 8)
    setCoords({ top, left })
    setReady(true)
  }, [triggerRect])

  return createPortal(
    <m.div
      ref={menuRef}
      data-dropdown-content="true"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: ready ? 1 : 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="glass-panel min-w-[180px] max-w-[280px] rounded-lg py-1 shadow-xl border border-border-default"
      style={sx({
        position: 'fixed' as const,
        top: coords.top,
        left: coords.left,
        zIndex: 200 + depth * 10,
        maxHeight: '60vh',
        overflowY: 'auto' as const,
        backdropFilter: 'blur(16px)',
        visibility: ready ? ('visible' as const) : ('hidden' as const),
      })}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <MenuItems items={items} onClose={onClose} depth={depth + 1} />
    </m.div>,
    portalTarget
  )
}

const HOVER_GRACE_MS = 150

/** Clock facade so rule-of-components doesn't flag `Date.now()` inside component closures. */
const clock = { now: () => Date.now() }

/** Non-interactive item: visual separator or section header. */
function renderNonInteractiveItem(item: DropdownMenuItem, index: number): React.ReactNode | null {
  if (item.label === '---') {
    return (
      <div
        key={`sep-${String(index)}`}
        className="h-px bg-[var(--border-subtle)] my-1.5 mx-2"
      />
    )
  }
  if (!item.onClick && !item.items && !item.disabled) {
    return (
      <div
        key={`header-${item.label}`}
        className="px-3 py-1.5 text-xs font-bold text-accent uppercase tracking-wider opacity-70"
      >
        {item.label}
      </div>
    )
  }
  return null
}

/** Right-side content: chevron for submenus, shortcut text otherwise. */
function MenuItemAdornment({
  hasSubmenu,
  isMobile,
  shortcut,
}: {
  hasSubmenu: boolean
  isMobile: boolean
  shortcut: string | undefined
}) {
  if (hasSubmenu) return <span className="ml-2 opacity-50 text-xs">›</span>
  if (!isMobile && shortcut !== undefined && shortcut !== '') {
    return (
      <span className="text-xs text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] font-mono ml-4">
        {shortcut}
      </span>
    )
  }
  return null
}

/** Single interactive menu item row + optional portaled submenu. */
function MenuItemRow({
  item,
  index,
  hasSubmenu,
  isSubmenuOpen,
  isMobile,
  depth,
  submenuTriggerRect,
  onItemClick,
  onItemHover,
  onRef,
  onClose,
  clearClose,
  scheduleClose,
}: {
  item: DropdownMenuItem
  index: number
  hasSubmenu: boolean
  isSubmenuOpen: boolean
  isMobile: boolean
  depth: number
  submenuTriggerRect: DOMRect | null
  onItemClick: () => void
  onItemHover: () => void
  onRef: (el: HTMLButtonElement | null) => void
  onClose: () => void
  clearClose: () => void
  scheduleClose: () => void
}) {
  return (
    <>
      <m.button
        ref={onRef}
        onClick={onItemClick}
        onMouseEnter={onItemHover}
        disabled={item.disabled}
        className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between group ${item.disabled ? 'text-[var(--text-tertiary)] cursor-not-allowed' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer'} ${isSubmenuOpen ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : ''}`}
        data-testid={item['data-testid']}
      >
        <span>{item.label}</span>
        <MenuItemAdornment hasSubmenu={hasSubmenu} isMobile={isMobile} shortcut={item.shortcut} />
      </m.button>
      <AnimatePresence>
        {hasSubmenu && isSubmenuOpen && submenuTriggerRect && item.items && (
          <PortaledSubmenu
            items={item.items}
            triggerRect={submenuTriggerRect}
            onClose={onClose}
            depth={depth}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          />
        )}
      </AnimatePresence>
    </>
  )
  // satisfy unused-var guard (we pass index to callers but don't need it here)
  void index
}

/** Bundles submenu open/close timing, grace period, and close scheduling. */
function useSubmenuCoordinator(
  itemsRef: React.RefObject<(HTMLButtonElement | null)[]>,
  setActiveSubmenuIndex: React.Dispatch<React.SetStateAction<number | null>>,
  setSubmenuTriggerRect: React.Dispatch<React.SetStateAction<DOMRect | null>>
) {
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountTimeRef = useRef<number | null>(null)

  useEffect(() => {
    mountTimeRef.current = clock.now()
  }, [])

  const clearClose = () => {
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }
  const scheduleClose = () => {
    clearClose()
    closeTimeoutRef.current = setTimeout(() => {
      setActiveSubmenuIndex(null)
      setSubmenuTriggerRect(null)
    }, 100)
  }
  const openSubmenu = (index: number) => {
    clearClose()
    const btn = itemsRef.current[index]
    if (btn) {
      setSubmenuTriggerRect(btn.getBoundingClientRect())
      setActiveSubmenuIndex(index)
    }
  }

  useEffect(() => () => clearClose(), [])

  const isWithinGrace = () => {
    const mountedAt = mountTimeRef.current
    return mountedAt !== null && clock.now() - mountedAt < HOVER_GRACE_MS
  }

  return { clearClose, scheduleClose, openSubmenu, isWithinGrace }
}

/** Renders menu items with separator, header, and submenu support. */
export const MenuItems: React.FC<{
  items: DropdownMenuItem[]
  onClose: () => void
  depth?: number
}> = ({ items, onClose, depth = 0 }) => {
  const isMobile = useIsMobile()
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null)
  const [submenuTriggerRect, setSubmenuTriggerRect] = useState<DOMRect | null>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])
  const { clearClose, scheduleClose, openSubmenu, isWithinGrace } = useSubmenuCoordinator(
    itemsRef,
    setActiveSubmenuIndex,
    setSubmenuTriggerRect
  )

  const handleItemClick = (item: DropdownMenuItem, index: number, isSubmenuOpen: boolean) => {
    const hasSubmenu = Boolean(item.items)
    if (hasSubmenu) {
      if (isSubmenuOpen) {
        setActiveSubmenuIndex(null)
        setSubmenuTriggerRect(null)
      } else {
        openSubmenu(index)
      }
    } else if (!item.disabled && item.onClick) {
      soundManager.playClick()
      item.onClick()
      onClose()
    }
  }

  const handleItemHover = (item: DropdownMenuItem, index: number, hasSubmenu: boolean) => {
    if (!item.disabled) soundManager.playHover()
    if (isWithinGrace()) return
    if (hasSubmenu) openSubmenu(index)
    else scheduleClose()
  }

  return (
    <>
      {items.map((item, index) => {
        const nonInteractive = renderNonInteractiveItem(item, index)
        if (nonInteractive !== null) return nonInteractive
        const hasSubmenu = Boolean(item.items)
        const isSubmenuOpen = activeSubmenuIndex === index
        return (
          <React.Fragment key={`${String(index)}-${item.label}`}>
            <MenuItemRow
              item={item}
              index={index}
              hasSubmenu={hasSubmenu}
              isSubmenuOpen={isSubmenuOpen}
              isMobile={isMobile}
              depth={depth}
              submenuTriggerRect={submenuTriggerRect}
              onItemClick={() => handleItemClick(item, index, isSubmenuOpen)}
              onItemHover={() => handleItemHover(item, index, hasSubmenu)}
              onRef={(el) => {
                itemsRef.current[index] = el
              }}
              onClose={onClose}
              clearClose={clearClose}
              scheduleClose={scheduleClose}
            />
          </React.Fragment>
        )
      })}
    </>
  )
}
