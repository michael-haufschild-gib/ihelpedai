import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react'
import { AnimatePresence, m, useDragControls, useMotionValue, type MotionValue } from 'motion/react'
import { soundManager } from '@/lib/audio/SoundManager'
import { sx } from '@/lib/sx'

const VIEWPORT_PADDING = 8
const DRAG_HANDLE_SELECTOR = '[data-popover-drag-handle="true"]'
const DRAG_IGNORE_SELECTOR = 'button, input, select, textarea, a, [role="button"], [role="link"]'

/** Props for the Popover component */
export interface PopoverProps {
  /** The trigger element that opens the popover on click */
  trigger: React.ReactNode
  /** The content to display inside the popover */
  content: React.ReactNode
  /** Additional CSS classes for the popover content container */
  className?: string
  /** Horizontal alignment relative to the trigger */
  align?: 'start' | 'end' | 'center'
  /** Vertical side to display the popover */
  side?: 'top' | 'bottom'
  /** Controlled open state */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Pixel offset from the trigger element */
  offset?: number
  /** Allow the popover to be repositioned via a drag handle inside the content */
  draggable?: boolean
}

interface ViewportRect {
  width: number
  height: number
}

interface PositionRect {
  top: number
  left: number
  width: number
  height: number
}

function getViewportRect(): ViewportRect {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function clampPopoverPosition(
  position: Pick<PositionRect, 'top' | 'left'>,
  popoverRect: Pick<PositionRect, 'width' | 'height'>
) {
  const viewport = getViewportRect()
  const maxLeft = Math.max(VIEWPORT_PADDING, viewport.width - popoverRect.width - VIEWPORT_PADDING)
  const maxTop = Math.max(VIEWPORT_PADDING, viewport.height - popoverRect.height - VIEWPORT_PADDING)

  return {
    left: Math.min(Math.max(position.left, VIEWPORT_PADDING), maxLeft),
    top: Math.min(Math.max(position.top, VIEWPORT_PADDING), maxTop),
  }
}

/**
 * Computes popover position relative to a trigger element, with viewport collision handling.
 */
function computePopoverPosition(
  triggerEl: HTMLElement,
  popoverEl: HTMLElement | null,
  side: 'top' | 'bottom',
  align: 'start' | 'end' | 'center',
  offset: number
): { top: number; left: number } {
  const triggerRect = triggerEl.getBoundingClientRect()
  const popoverRect = popoverEl?.getBoundingClientRect() || { width: 0, height: 0 }
  const spaceAbove = triggerRect.top - offset - VIEWPORT_PADDING
  const spaceBelow = window.innerHeight - triggerRect.bottom - offset - VIEWPORT_PADDING
  const preferredTop =
    side === 'bottom' ? triggerRect.bottom + offset : triggerRect.top - popoverRect.height - offset
  const fallbackTop =
    side === 'bottom' ? triggerRect.top - popoverRect.height - offset : triggerRect.bottom + offset
  const preferredFits =
    side === 'bottom'
      ? triggerRect.bottom + offset + popoverRect.height <= window.innerHeight - VIEWPORT_PADDING
      : preferredTop >= VIEWPORT_PADDING
  const fallbackFits =
    side === 'bottom'
      ? fallbackTop >= VIEWPORT_PADDING
      : triggerRect.bottom + offset + popoverRect.height <= window.innerHeight - VIEWPORT_PADDING

  const top =
    preferredFits || (!fallbackFits && spaceBelow >= spaceAbove) ? preferredTop : fallbackTop
  const left =
    align === 'start'
      ? triggerRect.left
      : align === 'end'
        ? triggerRect.right - popoverRect.width
        : triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2

  return clampPopoverPosition({ top, left }, popoverRect)
}

interface PopoverDragState {
  manualPositionRef: React.RefObject<{ top: number; left: number } | null>
  isDraggingRef: React.RefObject<boolean>
  dragControls: ReturnType<typeof useDragControls>
  dragX: MotionValue<number>
  dragY: MotionValue<number>
  isDragging: boolean
  dragConstraints: { left: number; right: number; top: number; bottom: number }
  setDragConstraints: React.Dispatch<
    React.SetStateAction<{ left: number; right: number; top: number; bottom: number }>
  >
  applyPositionRef: React.RefObject<((position: { top: number; left: number }) => void) | null>
  handleDragEnd: () => void
  handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onDragStart: () => void
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>
}

function usePopoverDrag(
  draggable: boolean,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  surfaceRef: React.RefObject<HTMLDivElement | null>
): PopoverDragState {
  const manualPositionRef = useRef<{ top: number; left: number } | null>(null)
  const isDraggingRef = useRef(false)
  const dragControls = useDragControls()
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const applyPositionRef = useRef<((position: { top: number; left: number }) => void) | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 })

  const handleDragEnd = useCallback(() => {
    const popover = popoverRef.current
    const surface = surfaceRef.current
    if (!popover || !surface) return

    const basePosition = {
      left: Number.parseFloat(popover.style.left !== '' ? popover.style.left : '0'),
      top: Number.parseFloat(popover.style.top !== '' ? popover.style.top : '0'),
    }
    const nextPosition = clampPopoverPosition(
      {
        left: basePosition.left + dragX.get(),
        top: basePosition.top + dragY.get(),
      },
      surface.getBoundingClientRect()
    )

    manualPositionRef.current = nextPosition
    dragX.jump(0)
    dragY.jump(0)
    applyPositionRef.current?.(nextPosition)
    isDraggingRef.current = false
    setIsDragging(false)
  }, [dragX, dragY, popoverRef, surfaceRef])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggable || event.button !== 0) return

      const target = event.target as HTMLElement | null
      if (target == null) return
      if (target.closest(DRAG_IGNORE_SELECTOR)) return
      if (target.closest(DRAG_HANDLE_SELECTOR) == null) return

      dragControls.start(event, { snapToCursor: false })
      event.preventDefault()
    },
    [dragControls, draggable]
  )

  const onDragStart = useCallback(() => {
    isDraggingRef.current = true
    setIsDragging(true)
  }, [])

  return {
    manualPositionRef,
    isDraggingRef,
    dragControls,
    dragX,
    dragY,
    isDragging,
    dragConstraints,
    setDragConstraints,
    applyPositionRef,
    handleDragEnd,
    handlePointerDown,
    onDragStart,
    setIsDragging,
  }
}

/** Writes the popover's top/left and updates drag constraints. */
function useApplyPopoverPosition(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  surfaceRef: React.RefObject<HTMLDivElement | null>,
  setDragConstraints: PopoverDragState['setDragConstraints']
) {
  return useCallback(
    (position: { top: number; left: number }) => {
      const popover = popoverRef.current
      const surface = surfaceRef.current
      if (!popover || !surface) return

      popover.style.top = `${String(position.top)}px`
      popover.style.left = `${String(position.left)}px`

      const surfaceRect = surface.getBoundingClientRect()
      const maxLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - surfaceRect.width - VIEWPORT_PADDING
      )
      const maxTop = Math.max(
        VIEWPORT_PADDING,
        window.innerHeight - surfaceRect.height - VIEWPORT_PADDING
      )

      setDragConstraints({
        left: VIEWPORT_PADDING - position.left,
        right: maxLeft - position.left,
        top: VIEWPORT_PADDING - position.top,
        bottom: maxTop - position.top,
      })
    },
    [popoverRef, surfaceRef, setDragConstraints]
  )
}

/** Attaches window/resize listeners that trigger updatePosition while the popover is open. */
function usePositionObservers(
  isOpen: boolean,
  updatePosition: () => void,
  surfaceRef: React.RefObject<HTMLDivElement | null>
) {
  useLayoutEffect(() => {
    if (!isOpen) return

    let rafId: number | null = null
    const schedulePositionUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        updatePosition()
        rafId = null
      })
    }
    const syncPositionUpdate = () => {
      updatePosition()
      schedulePositionUpdate()
    }

    const surfaceEl = surfaceRef.current
    const resizeObserver =
      surfaceEl == null ? null : new ResizeObserver(() => syncPositionUpdate())

    syncPositionUpdate()
    window.addEventListener('resize', syncPositionUpdate)
    window.addEventListener('scroll', syncPositionUpdate, true)
    if (surfaceEl != null) resizeObserver?.observe(surfaceEl)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncPositionUpdate)
      window.removeEventListener('scroll', syncPositionUpdate, true)
    }
  }, [isOpen, updatePosition, surfaceRef])
}

function usePopoverPositioning(
  isOpen: boolean,
  side: 'top' | 'bottom',
  align: 'start' | 'end' | 'center',
  offset: number,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  surfaceRef: React.RefObject<HTMLDivElement | null>,
  triggerRef: React.RefObject<HTMLDivElement | null>,
  drag: PopoverDragState
) {
  const {
    manualPositionRef,
    isDraggingRef,
    dragX,
    dragY,
    setDragConstraints,
    setIsDragging,
    applyPositionRef,
  } = drag

  const applyPopoverPosition = useApplyPopoverPosition(popoverRef, surfaceRef, setDragConstraints)

  useEffect(() => {
    applyPositionRef.current = applyPopoverPosition
  }, [applyPopoverPosition, applyPositionRef])

  const updatePosition = useCallback(() => {
    if (isDraggingRef.current) return

    const trigger = triggerRef.current
    const popover = popoverRef.current
    const surface = surfaceRef.current
    if (!trigger || !popover || !surface || !isOpen) return

    if (manualPositionRef.current) {
      const nextPosition = clampPopoverPosition(
        manualPositionRef.current,
        surface.getBoundingClientRect()
      )
      manualPositionRef.current = nextPosition
      dragX.set(0)
      dragY.set(0)
      applyPopoverPosition(nextPosition)
      return
    }

    const nextPosition = computePopoverPosition(trigger, surface, side, align, offset)
    dragX.set(0)
    dragY.set(0)
    applyPopoverPosition(nextPosition)
  }, [
    applyPopoverPosition,
    dragX,
    dragY,
    isOpen,
    side,
    align,
    offset,
    isDraggingRef,
    triggerRef,
    popoverRef,
    surfaceRef,
    manualPositionRef,
  ])

  usePositionObservers(isOpen, updatePosition, surfaceRef)

  useEffect(() => {
    if (isOpen) return
    manualPositionRef.current = null
    dragX.set(0)
    dragY.set(0)
    setIsDragging(false)
  }, [dragX, dragY, isOpen, manualPositionRef, setIsDragging])
}

/**
 * Floating popover component with automatic positioning and animations.
 *
 * Supports both controlled and uncontrolled modes. Automatically repositions
 * to stay within viewport bounds. Closes on outside click or Escape key.
 */
/** Syncs the native popover API open state with React-controlled `isOpen`. */
function useNativePopoverSync(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  handleOpenChange: (open: boolean) => void
) {
  useEffect(() => {
    const popover = popoverRef.current
    if (!popover) return
    if (isOpen && !popover.matches(':popover-open')) popover.showPopover()
    else if (!isOpen && popover.matches(':popover-open')) popover.hidePopover()
  }, [isOpen, popoverRef])

  useEffect(() => {
    const popover = popoverRef.current
    if (!popover) return
    const handleToggle = (e: Event) => {
      handleOpenChange((e as ToggleEvent).newState === 'open')
    }
    popover.addEventListener('toggle', handleToggle)
    return () => popover.removeEventListener('toggle', handleToggle)
  }, [handleOpenChange, popoverRef])
}

/** The content surface (m.div) with drag + animation. */
function PopoverSurface({
  isOpen,
  surfaceRef,
  drag,
  draggable,
  className,
  children,
}: {
  isOpen: boolean
  surfaceRef: React.RefObject<HTMLDivElement | null>
  drag: PopoverDragState
  draggable: boolean
  className: string
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          ref={surfaceRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          drag={draggable}
          dragControls={drag.dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={drag.dragConstraints}
          onDragStart={drag.onDragStart}
          onDragEnd={drag.handleDragEnd}
          transition={{ duration: 0.1, ease: 'easeOut' }}
          className={`glass-panel rounded-lg shadow-2xl border border-border-default ${className}`}
          onPointerDown={drag.handlePointerDown}
          style={{
            backdropFilter: 'blur(24px)',
            maxWidth: 'calc(100dvw - 16px)',
            maxHeight: 'calc(100dvh - 16px)',
            overflow: 'auto',
            x: drag.dragX,
            y: drag.dragY,
            cursor: draggable && drag.isDragging ? 'grabbing' : undefined,
          }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  )
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  className = '',
  align = 'start',
  side = 'bottom',
  open: controlledOpen,
  onOpenChange,
  offset = 4,
  draggable = false,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const drag = usePopoverDrag(draggable, popoverRef, surfaceRef)
  usePopoverPositioning(isOpen, side, align, offset, popoverRef, surfaceRef, triggerRef, drag)

  const prevIsOpenRef = useRef(isOpen)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) soundManager.playSwish()
    prevIsOpenRef.current = isOpen
  }, [isOpen])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!isControlled) setUncontrolledOpen(newOpen)
      onOpenChange?.(newOpen)
    },
    [isControlled, onOpenChange]
  )

  useNativePopoverSync(popoverRef, isOpen, handleOpenChange)

  return (
    <>
      <div
        data-testid="popover-open-change"
        ref={triggerRef}
        onClick={() => handleOpenChange(!isOpen)}
        className="inline-block cursor-pointer"
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>

      <div
        ref={popoverRef}
        popover="auto"
        id={popoverId}
        className="m-0 p-0 border-none bg-transparent"
        style={sx({ position: 'fixed' as const, top: 0, left: 0 })}
      >
        <PopoverSurface
          isOpen={isOpen}
          surfaceRef={surfaceRef}
          drag={drag}
          draggable={draggable}
          className={className}
        >
          {content}
        </PopoverSurface>
      </div>
    </>
  )
}
