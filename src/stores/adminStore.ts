import { create } from 'zustand'

import type { AdminUser } from '@/lib/adminApi'
import { getMe } from '@/lib/adminApi'

/** Admin auth state. */
interface AdminState {
  admin: AdminUser | null
  loading: boolean
  checked: boolean
  checkSession: () => Promise<void>
  setAdmin: (admin: AdminUser | null) => void
  clear: () => void
}

/** Zustand store for admin authentication state. */
export const useAdminStore = create<AdminState>((set, get) => ({
  admin: null,
  loading: true,
  checked: false,
  checkSession: async () => {
    if (get().checked) {
      set({ loading: false })
      return
    }
    set({ loading: true })
    try {
      const me = await getMe()
      set({ admin: { id: me.id, email: me.email }, loading: false, checked: true })
    } catch {
      set({ admin: null, loading: false, checked: true })
    }
  },
  setAdmin: (admin) => set({ admin, checked: true, loading: false }),
  clear: () => set({ admin: null, checked: false, loading: false }),
}))
