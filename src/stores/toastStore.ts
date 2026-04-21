/**
 * Global toast store — call showToast() from anywhere in the app. Consumers
 * who want the toasts rendered must mount <GlobalToast /> somewhere in the
 * tree (ihelped.ai itself doesn't use toasts yet, so the renderer is
 * intentionally not mounted at the app root).
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
