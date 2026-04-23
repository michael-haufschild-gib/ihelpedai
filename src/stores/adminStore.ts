import { create } from 'zustand'

import type { AdminUser } from '@/lib/adminApi'
import { ADMIN_SESSION_EXPIRED_EVENT, getMe } from '@/lib/adminApi'
import { showToast } from '@/stores/toastStore'

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

/**
 * Subscribe once at module init to the session-expired window event fired by
 * the admin fetch wrapper. The handler only reacts when the store actually
 * held a populated admin — so 401s from the unauthenticated `/api/admin/me`
 * probe on login/forgot/reset pages stay silent. AdminLayout's existing
 * `useEffect(!admin → navigate('/admin/login'))` handles the redirect.
 */
if (typeof window !== 'undefined') {
  window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, () => {
    const state = useAdminStore.getState()
    if (state.admin !== null) {
      state.clear()
      showToast('Your session expired. Please sign in again.')
    }
  })
}
