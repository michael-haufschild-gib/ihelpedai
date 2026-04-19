/**
 * Dropdown Store
 * Coordinates dropdown menu state globally — only one dropdown open at a time.
 */

import { create } from 'zustand'

interface DropdownStore {
  openDropdownId: string | null
  openDropdown: (id: string) => void
  closeDropdown: (id?: string) => void
  toggleDropdown: (id: string) => void
}

export const useDropdownStore = create<DropdownStore>((set, get) => ({
  openDropdownId: null,

  openDropdown: (id) => {
    set({ openDropdownId: id })
  },

  closeDropdown: (id) => {
    const current = get().openDropdownId
    if (!id || current === id) {
      set({ openDropdownId: null })
    }
  },

  toggleDropdown: (id) => {
    const current = get().openDropdownId
    set({ openDropdownId: current === id ? null : id })
  },
}))
