import type { StateCreator } from 'zustand'
import type { Preset, Variable, CreatePresetInput, UpdatePresetInput, IpcResult, ActivationResult } from '../../shared/types'

export interface PresetSlice {
  presets: Preset[]
  activePresetId: string | null
  selectedPresetId: string | null
  isLoading: boolean
  error: string | null
  loadPresets: () => Promise<void>
  createPreset: (name: string) => Promise<Preset | null>
  updatePreset: (id: string, data: UpdatePresetInput) => Promise<Preset | null>
  deletePreset: (id: string) => Promise<boolean>
  duplicatePreset: (id: string) => Promise<Preset | null>
  activatePreset: (id: string) => Promise<IpcResult<ActivationResult> | null>
  deactivatePreset: () => Promise<IpcResult<boolean> | null>
  selectPreset: (id: string | null) => void
  clearError: () => void
}

function getApi(): Window['envApi'] | null {
  return (window as any).envApi ?? null
}

export const createPresetSlice: StateCreator<PresetSlice> = (set, get) => ({
  presets: [],
  activePresetId: null,
  selectedPresetId: null,
  isLoading: false,
  error: null,

  loadPresets: async () => {
    const api = getApi()
    if (!api) return
    set({ isLoading: true, error: null })
    const [presetResult, activeIdResult] = await Promise.all([
      api.preset.list(),
      api.preset.getActiveId(),
    ])
    if (presetResult.success && presetResult.data) {
      set({
        presets: presetResult.data,
        activePresetId: activeIdResult.success ? (activeIdResult.data ?? null) : null,
        isLoading: false,
      })
    } else {
      set({ error: presetResult.error?.message ?? 'Failed to load presets', isLoading: false })
    }
  },

  createPreset: async (name: string) => {
    const api = getApi()
    if (!api) return null
    const result = await api.preset.create({ name })
    if (result.success && result.data) {
      set(state => ({ presets: [...state.presets, result.data!] }))
      return result.data
    }
    set({ error: result.error?.message ?? 'Failed to create preset' })
    return null
  },

  updatePreset: async (id: string, data: UpdatePresetInput) => {
    const api = getApi()
    if (!api) return null
    const result = await api.preset.update(id, data)
    if (result.success && result.data) {
      set(state => ({
        presets: state.presets.map(p => p.id === id ? result.data! : p),
      }))
      return result.data
    }
    set({ error: result.error?.message ?? 'Failed to update preset' })
    return null
  },

  deletePreset: async (id: string) => {
    const api = getApi()
    if (!api) return false
    const result = await api.preset.delete(id)
    if (result.success) {
      set(state => ({
        presets: state.presets.filter(p => p.id !== id),
        selectedPresetId: state.selectedPresetId === id ? null : state.selectedPresetId,
        activePresetId: state.activePresetId === id ? null : state.activePresetId,
      }))
      return true
    }
    set({ error: result.error?.message ?? 'Failed to delete preset' })
    return false
  },

  duplicatePreset: async (id: string) => {
    const api = getApi()
    if (!api) return null
    const result = await api.preset.duplicate(id)
    if (result.success && result.data) {
      set(state => ({ presets: [...state.presets, result.data!] }))
      return result.data
    }
    set({ error: result.error?.message ?? 'Failed to duplicate preset' })
    return null
  },

  activatePreset: async (id: string) => {
    const api = getApi()
    if (!api) return null
    set({ isLoading: true, error: null })
    const result = await api.preset.activate(id)
    if (result.success) {
      set({ activePresetId: id, isLoading: false })
    } else {
      set({ error: result.error?.message ?? 'Failed to activate preset', isLoading: false })
    }
    return result as IpcResult<ActivationResult>
  },

  deactivatePreset: async () => {
    const api = getApi()
    if (!api) return null
    set({ isLoading: true, error: null })
    const result = await api.preset.deactivate()
    if (result.success) {
      set({ activePresetId: null, isLoading: false })
    } else {
      set({ error: result.error?.message ?? 'Failed to deactivate preset', isLoading: false })
    }
    return result
  },

  selectPreset: (id: string | null) => set({ selectedPresetId: id }),

  clearError: () => set({ error: null }),
})
