import { createPortal } from 'react-dom'
import { useToastStore } from '@/stores/toastStore'
import { ToastContent } from './Toast'

/** Renders the global toast portal. Mount once at the app root. */
export function GlobalToast() {
  const id = useToastStore((s) => s.id)
  const message = useToastStore((s) => s.message)
  const clearToast = useToastStore((s) => s.clearToast)

  if (!message) return null

  return createPortal(
    <div data-testid="global-toast">
      <ToastContent key={id} message={message} onDone={clearToast} />
    </div>,
    document.body
  )
}
