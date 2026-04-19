/**
 * Global toast store — call showToast() from anywhere in the app.
 * A single GlobalToast renderer in App.tsx subscribes and renders the portal.
 */

import { create } from 'zustand'

interface ToastState {
  message: string | null
  showToast: (msg: string) => void
  clearToast: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (msg) => set({ message: msg }),
  clearToast: () => set({ message: null }),
}))

/** Non-hook accessor — callable from event handlers, callbacks, or non-React code. */
export const showToast = (msg: string) => useToastStore.getState().showToast(msg)
