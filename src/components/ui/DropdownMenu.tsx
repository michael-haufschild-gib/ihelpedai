import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { useShallow } from 'zustand/react/shallow'
import { soundManager } from '@/lib/audio/SoundManager'
import { useDropdownStore } from '@/stores/dropdownStore'
import { sx } from '@/lib/sx'
import { MenuItems } from './DropdownMenuItems'
import { SubmenuPortalContext } from './SubmenuPortalContext'

/** Single item in a dropdown menu (supports submenus). */
export interface DropdownMenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  'data-testid'?: string
  items?: DropdownMenuItem[]
}

/** Props for the DropdownMenu component. */
export interface DropdownMenuProps {
  trigger: React.ReactNode
  items: DropdownMenuItem[]
  className?: string
  align?: 'left' | 'right'
  maxHeight?: number
  onClose?: () => void
  id?: string
}

/** Manages popover positioning relative to the trigger element. */
function useDropdownPosition(
  isOpen: boolean,
  align: 'left' | 'right',
  triggerRef: React.RefObject<HTMLElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>
) {
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isOpen || !popoverRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const cr = popoverRef.current.getBoundingClientRect()
    let top = tr.bottom + 4
    if (tr.bottom + 4 + cr.height > window.innerHeight && tr.top > window.innerHeight - tr.bottom) {
      top = Math.max(8, tr.top - cr.height - 4)
    }
    let left = align === 'right' ? tr.right - cr.width : tr.left
    left = Math.max(8, Math.min(left, window.innerWidth - cr.width - 8))
    setCoords({ top, left })
  }, [isOpen, align, triggerRef, popoverRef])

  useLayoutEffect(() => {
    if (!isOpen) return
    let rafId: number | null = null
    const throttled = () => {
      if (rafId === null)
        rafId = requestAnimationFrame(() => {
          updatePosition()
          rafId = null
        })
    }
    requestAnimationFrame(updatePosition)
    window.addEventListener('resize', throttled)
    window.addEventListener('scroll', throttled, true)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', throttled)
      window.removeEventListener('scroll', throttled, true)
    }
  }, [isOpen, updatePosition])

  return coords
}

/** Dropdown menu with global state coordination and native popover API. */
export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  className = '',
  align = 'left',
  maxHeight,
  onClose,
  id: providedId,
}) => {
  const autoId = useId()
  const dropdownId = providedId ?? `dropdown-${autoId}`
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const { isOpen, toggleDropdown, closeDropdown, openDropdown } = useDropdownStore(
    useShallow((state) => ({
      isOpen: state.openDropdownId === dropdownId,
      toggleDropdown: state.toggleDropdown,
      closeDropdown: state.closeDropdown,
      openDropdown: state.openDropdown,
    }))
  )

  const coords = useDropdownPosition(isOpen, align, triggerRef, popoverRef)

  const prevIsOpenRef = useRef(isOpen)
  useEffect(() => {
    if (prevIsOpenRef.current && !isOpen && onClose) onClose()
    prevIsOpenRef.current = isOpen
  }, [isOpen, onClose])

  useEffect(() => {
    const p = popoverRef.current
    if (!p) return
    if (isOpen && !p.matches(':popover-open')) p.showPopover()
    else if (!isOpen && p.matches(':popover-open')) p.hidePopover()
  }, [isOpen])

  useEffect(() => {
    const p = popoverRef.current
    if (!p) return
    const handle = (e: Event) => {
      const te = e as ToggleEvent
      if (te.newState === 'closed') {
        closeDropdown(dropdownId)
      } else {
        openDropdown(dropdownId)
      }
    }
    p.addEventListener('toggle', handle)
    return () => p.removeEventListener('toggle', handle)
  }, [dropdownId, closeDropdown, openDropdown])

  const menuVariants = {
    closed: { opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.1 } },
    open: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: 'spring' as const, damping: 25, stiffness: 400, mass: 0.5 },
    },
  }

  return (
    <>
      <button
        type="button"
        data-testid="dropdown-menu-toggle"
        ref={triggerRef}
        data-dropdown-trigger={dropdownId}
        onClick={(e) => {
          if (isOpen) {
            soundManager.playClick()
          } else {
            soundManager.playSwish()
          }
          toggleDropdown(dropdownId)
          e.stopPropagation()
        }}
        className={`cursor-pointer ${className}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {trigger}
      </button>
      <div
        ref={popoverRef}
        popover="auto"
        id={dropdownId}
        data-dropdown-content="true"
        data-dropdown-id={dropdownId}
        className="m-0 p-0 border-none bg-transparent"
        style={sx({ position: 'fixed' as const, top: coords.top, left: coords.left })}
      >
        <SubmenuPortalContext value={popoverRef}>
          <AnimatePresence>
            {isOpen && (
              <m.div
                data-testid="dropdown-menu-stop-propagation"
                initial="closed"
                animate="open"
                exit="closed"
                variants={menuVariants}
                className="glass-panel min-w-[180px] rounded-lg py-1 shadow-xl border border-border-default"
                style={sx({
                  maxHeight: maxHeight ?? '80vh',
                  overflowY: 'auto' as const,
                  backdropFilter: 'blur(16px)',
                })}
                onClick={(e) => e.stopPropagation()}
              >
                <MenuItems items={items} onClose={() => closeDropdown(dropdownId)} />
              </m.div>
            )}
          </AnimatePresence>
        </SubmenuPortalContext>
      </div>
    </>
  )
}
