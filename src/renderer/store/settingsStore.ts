import type { StateCreator } from 'zustand'
import type { Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/constants'

export interface SettingsSlice {
  settings: Settings
  loadSettings: () => Promise<void>
  updateSettings: (partial: Partial<Settings>) => Promise<void>
}

function getApi(): Window['envApi'] | null {
  return window.envApi ?? null
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  settings: { ...DEFAULT_SETTINGS },

  loadSettings: async () => {
    const api = getApi()
    if (!api) return
    const result = await api.settings.get()
    if (result.success && result.data) {
      set({ settings: result.data })
    }
  },

  updateSettings: async (partial: Partial<Settings>) => {
    const api = getApi()
    if (!api) return
    const result = await api.settings.update(partial)
    if (result.success && result.data) {
      set({ settings: result.data })
    }
  },
})
