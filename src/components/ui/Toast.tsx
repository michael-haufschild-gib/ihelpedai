import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useRef } from 'react'
import './Toast.css'

interface ToastProps {
  message: string
  onDone: () => void
}

const ENTRY_MS = 420
const VISIBLE_MS = 2800
const EXIT_MS = 320

/** Self-dismissing toast notification that rises from the bottom of the viewport. */
export function ToastContent({ message, onDone }: ToastProps) {
  const toastRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const { theme, accent } = useLayoutStore(
    useShallow((s: LayoutStore) => ({ theme: s.theme, accent: s.accent }))
  )

  useEffect(() => {
    const toast = toastRef.current
    const progress = progressRef.current
    if (!toast || !progress) return

    toast.animate(
      [
        { transform: 'translate3d(0, 120%, 0) scale(0.96)', opacity: '0' },
        { transform: 'translate3d(0, -8%, 0) scale(1.02)', opacity: '1', offset: 0.7 },
        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' },
      ],
      { duration: ENTRY_MS, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
    )

    progress.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
      duration: VISIBLE_MS,
      easing: 'linear',
      fill: 'forwards',
    })

    let disposed = false
    const exitTimer = setTimeout(() => {
      const exitAnim = toast.animate(
        [
          { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' },
          { transform: 'translate3d(0, 12%, 0) scale(0.98)', opacity: '0.9', offset: 0.5 },
          { transform: 'translate3d(0, -120%, 0) scale(0.9)', opacity: '0' },
        ],
        { duration: EXIT_MS, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
      )
      exitAnim.onfinish = () => {
        if (!disposed) onDone()
      }
    }, VISIBLE_MS)

    return () => {
      disposed = true
      clearTimeout(exitTimer)
      toast.getAnimations().forEach((a) => a.cancel())
      progress.getAnimations().forEach((a) => a.cancel())
    }
  }, [onDone])

  return (
    <div className="pf-app-toast-shell" data-app-theme data-mode={theme} data-accent={accent}>
      <div
        ref={toastRef}
        className="pf-app-toast glass-panel"
        role="status"
        aria-live="polite"
        data-testid="app-toast"
      >
        <div className="pf-app-toast__message">{message}</div>
        <div className="pf-app-toast__track">
          <div ref={progressRef} className="pf-app-toast__progress" />
        </div>
      </div>
    </div>
  )
}
