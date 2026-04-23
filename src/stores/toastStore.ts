/**
 * Global toast store — call showToast() from anywhere in the app. Consumers
 * who want the toasts rendered must mount <GlobalToast /> somewhere in the
 * tree. It is mounted by {@link ../layout/admin/AdminLayout.tsx} so every
 * admin page surfaces session-expiry and action-failure toasts without
 * needing to render the component themselves. Public pages don't mount
 * GlobalToast — they use inline feedback (see ReportEntry's copy-link
 * flash) because their flows stay simpler than admin moderation.
 */

import { create } from 'zustand'

interface ToastState {
  id: number
  message: string | null
  showToast: (msg: string) => void
  clearToast: () => void
}

let nextToastId = 0

export const useToastStore = create<ToastState>((set) => ({
  id: 0,
  message: null,
  showToast: (msg) => set({ message: msg, id: ++nextToastId }),
  clearToast: () => set({ message: null }),
}))

/** Non-hook accessor — callable from event handlers, callbacks, or non-React code. */
export const showToast = (msg: string) => useToastStore.getState().showToast(msg)
