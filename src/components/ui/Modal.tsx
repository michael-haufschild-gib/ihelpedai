import React, { useEffect, useId, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from './Button'
import { sx } from '@/lib/sx'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { useScrollLock } from '@/hooks/useScrollLock'

/** Props for the Modal component. */
export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Extra content rendered in the header row, right of the title (before close button). */
  headerRight?: React.ReactNode
  /** Width class for the dialog (default: 'max-w-md'). */
  width?: string
  /** Override the default body padding/scroll classes. */
  bodyClassName?: string
  'data-testid'?: string
}

/** Modal header with title, optional right-side content, and close button. */
function ModalHeader({
  titleId,
  title,
  headerRight,
  onClose,
}: {
  titleId: string
  title: string
  headerRight?: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border bg-panel-header/50">
      <h2
        id={titleId}
        data-testid="modal-title"
        className="text-sm font-bold text-text-primary tracking-wide uppercase"
      >
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {headerRight}
        <Button
          data-testid="modal-close"
          variant="ghost"
          size="icon"
          onClick={onClose}
          ariaLabel="Close modal"
          className="p-1"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      </div>
    </div>
  )
}

/** Accessible modal dialog using native HTML dialog element with focus trapping and backdrop. */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  headerRight,
  width = 'max-w-md',
  bodyClassName = 'p-4 max-h-modal overflow-y-auto custom-scrollbar',
  'data-testid': dataTestId,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const isProgrammaticCloseRef = useRef(false)
  const titleId = useId()
  const { theme, accent } = useLayoutStore(
    useShallow((s: LayoutStore) => ({ theme: s.theme, accent: s.accent }))
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen && !dialog.open) {
      previousActiveElementRef.current = document.activeElement as HTMLElement
      dialog.showModal()
    } else if (!isOpen && dialog.open) {
      isProgrammaticCloseRef.current = true
      dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => {
      const prev = previousActiveElementRef.current
      if (prev && document.body.contains(prev)) prev.focus()
      if (isProgrammaticCloseRef.current) {
        isProgrammaticCloseRef.current = false
        return
      }
      onClose()
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  // Delegate body scroll locking to the shared reference-counted hook so
  // stacked modals / drawers don't clobber each other's overflow state.
  useScrollLock(isOpen)

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className={`${width} w-full p-0 bg-transparent border-none rounded-lg backdrop:bg-[var(--bg-app)]/50 backdrop:backdrop-blur-sm open:animate-in open:zoom-in-95 open:fade-in duration-200`}
      style={sx({ margin: 'auto' })}
      data-app-theme
      data-mode={theme}
      data-accent={accent}
      data-testid={dataTestId}
    >
      <div className="glass-panel rounded-lg shadow-2xl overflow-hidden pointer-events-auto">
        <ModalHeader titleId={titleId} title={title} headerRight={headerRight} onClose={onClose} />
        <div className={bodyClassName}>{children}</div>
      </div>
    </dialog>
  )
}
