import type { StateCreator } from 'zustand'

export type Page = 'presets' | 'backups' | 'settings'

export interface ConfirmDialogState {
  open: boolean
  title: string
  message: string
  onConfirm: () => Promise<void>
  /** When true, the confirm button is styled as destructive (red). */
  destructive?: boolean
  /** Custom label for the confirm button (defaults to "Confirm"). */
  confirmLabel?: string
}

export interface ToastState {
  message: string
  type: 'success' | 'error' | 'info'
  /** Optional undo action — when present, an "Undo" button appears in the toast. */
  onUndo?: () => void
}

const STORAGE_KEY_FOLDERS = 'envchanger:folderNames'

function loadFolderNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FOLDERS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveFolderNames(names: string[]): void {
  localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(names))
}

export interface UiSlice {
  currentPage: Page
  confirmDialog: ConfirmDialogState | null
  toast: ToastState | null
  /** Folder names preserved even when empty (so empty folders stay visible). */
  folderNames: string[]
  setCurrentPage: (page: Page) => void
  showConfirm: (title: string, message: string, onConfirm: () => Promise<void>, opts?: { destructive?: boolean; confirmLabel?: string }) => void
  closeConfirm: () => void
  showToast: (message: string, type: 'success' | 'error' | 'info', opts?: { onUndo?: () => void }) => void
  clearToast: () => void
  addFolder: (name: string) => void
  removeFolder: (name: string) => void
  renameFolder: (oldName: string, newName: string) => void
  reorderFolders: (fromIndex: number, toIndex: number) => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  currentPage: 'presets',
  confirmDialog: null,
  toast: null,
  folderNames: loadFolderNames(),

  setCurrentPage: (page) => set({ currentPage: page }),

  showConfirm: (title, message, onConfirm, opts) =>
    set({ confirmDialog: { open: true, title, message, onConfirm, destructive: opts?.destructive, confirmLabel: opts?.confirmLabel } }),

  closeConfirm: () => set({ confirmDialog: null }),

  showToast: (message, type, opts) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { message, type, onUndo: opts?.onUndo } })
    // Undo toasts get longer display time
    const duration = opts?.onUndo ? 6000 : 4000
    toastTimer = setTimeout(() => set({ toast: null }), duration)
  },

  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: null })
  },

  addFolder: (name: string) => set(state => {
    const trimmed = name.trim()
    if (!trimmed || state.folderNames.includes(trimmed)) return state
    const next = [...state.folderNames, trimmed]
    saveFolderNames(next)
    return { folderNames: next }
  }),

  removeFolder: (name: string) => set(state => {
    const next = state.folderNames.filter(f => f !== name)
    saveFolderNames(next)
    return { folderNames: next }
  }),

  renameFolder: (oldName: string, newName: string) => set(state => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return state
    const next = state.folderNames.map(f => f === oldName ? trimmed : f)
    saveFolderNames(next)
    return { folderNames: next }
  }),

  reorderFolders: (fromIndex: number, toIndex: number) => set(state => {
    const next = [...state.folderNames]
    if (fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length) return state
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    saveFolderNames(next)
    return { folderNames: next }
  }),
})
