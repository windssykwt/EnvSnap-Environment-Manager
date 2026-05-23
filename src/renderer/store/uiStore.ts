import type { StateCreator } from 'zustand'

export type Page = 'presets' | 'backups' | 'settings'

export interface ConfirmDialogState {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  /** When true, the confirm button is styled as destructive (red). */
  destructive?: boolean
  /** Custom label for the confirm button (defaults to "Confirm"). */
  confirmLabel?: string
}

export interface UiSlice {
  currentPage: Page
  confirmDialog: ConfirmDialogState | null
  toast: { message: string; type: 'success' | 'error' | 'info' } | null
  setCurrentPage: (page: Page) => void
  showConfirm: (title: string, message: string, onConfirm: () => void, opts?: { destructive?: boolean; confirmLabel?: string }) => void
  closeConfirm: () => void
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  clearToast: () => void
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  currentPage: 'presets',
  confirmDialog: null,
  toast: null,

  setCurrentPage: (page) => set({ currentPage: page }),

  showConfirm: (title, message, onConfirm, opts) =>
    set({ confirmDialog: { open: true, title, message, onConfirm, destructive: opts?.destructive, confirmLabel: opts?.confirmLabel } }),

  closeConfirm: () => set({ confirmDialog: null }),

  showToast: (message, type) => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 4000)
  },

  clearToast: () => set({ toast: null }),
})
