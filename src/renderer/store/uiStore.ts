import type { StateCreator } from 'zustand'

export type Page = 'presets' | 'backups' | 'settings'

export interface UiSlice {
  currentPage: Page
  confirmDialog: { open: boolean; title: string; message: string; onConfirm: () => void } | null
  toast: { message: string; type: 'success' | 'error' | 'info' } | null
  setCurrentPage: (page: Page) => void
  showConfirm: (title: string, message: string, onConfirm: () => void) => void
  closeConfirm: () => void
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  clearToast: () => void
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  currentPage: 'presets',
  confirmDialog: null,
  toast: null,

  setCurrentPage: (page) => set({ currentPage: page }),

  showConfirm: (title, message, onConfirm) =>
    set({ confirmDialog: { open: true, title, message, onConfirm } }),

  closeConfirm: () => set({ confirmDialog: null }),

  showToast: (message, type) => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 4000)
  },

  clearToast: () => set({ toast: null }),
})
