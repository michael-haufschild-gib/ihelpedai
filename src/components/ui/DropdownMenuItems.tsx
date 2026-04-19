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
  const portalTarget = portalContainerRef?.current ?? document.body

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
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mountTime] = useState(() => Date.now())

  const clearClose = () => {
    if (closeTimeoutRef.current) {
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

  return (
    <>
      {items.map((item, index) => {
        if (item.label === '---')
          return (
            <div
              key={`sep-${String(index)}`}
              className="h-px bg-[var(--border-subtle)] my-1.5 mx-2"
            />
          )
        if (!item.onClick && !item.items && !item.disabled)
          return (
            <div
              key={`header-${item.label}`}
              className="px-3 py-1.5 text-xs font-bold text-accent uppercase tracking-wider opacity-70"
            >
              {item.label}
            </div>
          )

        const hasSubmenu = Boolean(item.items)
        const isSubmenuOpen = activeSubmenuIndex === index
        const isGrace = Date.now() - mountTime < 150

        return (
          <React.Fragment key={item.label}>
            <m.button
              ref={(el) => {
                itemsRef.current[index] = el
              }}
              onClick={() => {
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
              }}
              onMouseEnter={() => {
                if (!item.disabled) soundManager.playHover()
                if (isGrace) return
                if (hasSubmenu) {
                  openSubmenu(index)
                } else {
                  scheduleClose()
                }
              }}
              disabled={item.disabled}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between group ${item.disabled ? 'text-[var(--text-tertiary)] cursor-not-allowed' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer'} ${isSubmenuOpen ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : ''}`}
              data-testid={item['data-testid']}
            >
              <span>{item.label}</span>
              {hasSubmenu ? (
                <span className="ml-2 opacity-50 text-xs">›</span>
              ) : !isMobile && item.shortcut ? (
                <span className="text-xs text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] font-mono ml-4">
                  {item.shortcut}
                </span>
              ) : null}
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
          </React.Fragment>
        )
      })}
    </>
  )
}
