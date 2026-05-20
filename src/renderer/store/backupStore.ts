import type { StateCreator } from 'zustand'
import type { Backup, Preset } from '../../shared/types'

export interface BackupSlice {
  backups: Backup[]
  isLoadingBackups: boolean
  loadBackups: () => Promise<void>
  restoreBackup: (id: string) => Promise<Preset | null>
  restorePreActivation: (id: string) => Promise<{ restoredCount: number; deletedCount: number } | null>
  deleteBackup: (id: string) => Promise<boolean>
  deleteAllBackups: () => Promise<number>
}

function getApi(): Window['envApi'] | null {
  return (window as any).envApi ?? null
}

export const createBackupSlice: StateCreator<BackupSlice> = (set, get) => ({
  backups: [],
  isLoadingBackups: false,

  loadBackups: async () => {
    const api = getApi()
    if (!api) return
    set({ isLoadingBackups: true })
    const result = await api.backup.list()
    if (result.success && result.data) {
      set({ backups: result.data, isLoadingBackups: false })
    } else {
      set({ isLoadingBackups: false })
    }
  },

  restoreBackup: async (id: string) => {
    const api = getApi()
    if (!api) return null
    const result = await api.backup.restore(id)
    if (result.success && result.data) {
      // The main process created a new preset from the backup snapshot.
      // Reload presets so the sidebar shows it.
      const combined = get() as BackupSlice & { loadPresets?: () => Promise<void> }
      await combined.loadPresets?.()
      return result.data
    }
    return null
  },

  restorePreActivation: async (id: string) => {
    const api = getApi()
    if (!api?.backup?.restorePreActivation) return null
    const result = await api.backup.restorePreActivation(id)
    if (result.success && result.data) {
      // Active preset pointer may have changed in the main process.
      // Reload presets so the active highlight is in sync.
      const combined = get() as BackupSlice & { loadPresets?: () => Promise<void> }
      await combined.loadPresets?.()
      return result.data
    }
    return null
  },

  deleteBackup: async (id: string) => {
    const api = getApi()
    if (!api) return false
    const result = await api.backup.delete(id)
    if (result.success) {
      set(state => ({ backups: state.backups.filter(b => b.id !== id) }))
      return true
    }
    return false
  },

  deleteAllBackups: async () => {
    const api = getApi()
    if (!api) return 0
    const result = await api.backup.deleteAll()
    if (result.success && result.data) {
      set({ backups: [] })
      return result.data.deleted
    }
    return 0
  },
})
