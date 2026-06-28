import type { StateCreator } from 'zustand'
import type { Preset, Variable, CreatePresetInput, UpdatePresetInput, IpcResult, ActivationResult, ReorderItem } from '../../shared/types'

export interface PresetSlice {
  presets: Preset[]
  activePresetId: string | null
  selectedPresetId: string | null
  isLoading: boolean
  error: string | null
  loadPresets: () => Promise<void>
  createPreset: (name: string, group?: string) => Promise<Preset | null>
  updatePreset: (id: string, data: UpdatePresetInput) => Promise<Preset | null>
  deletePreset: (id: string) => Promise<boolean>
  duplicatePreset: (id: string) => Promise<Preset | null>
  reorderPresets: (items: ReorderItem[]) => Promise<boolean>
  activatePreset: (id: string) => Promise<IpcResult<ActivationResult> | null>
  deactivatePreset: () => Promise<IpcResult<boolean> | null>
  selectPreset: (id: string | null) => void
  clearError: () => void
}

function getApi(): Window['envApi'] | null {
  return window.envApi ?? null
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
      const errMsg = presetResult.error?.message ?? 'Failed to load presets'
      set({ error: errMsg, isLoading: false })
      ;(get() as any).showToast?.(errMsg, 'error')
    }
  },

  createPreset: async (name: string, group?: string) => {
    const api = getApi()
    if (!api) return null
    const result = await api.preset.create({ name, group })
    if (result.success && result.data) {
      set(state => ({ presets: [...state.presets, result.data!] }))
      return result.data
    }
    const errMsg = result.error?.message ?? 'Failed to create preset'
    set({ error: errMsg })
    ;(get() as any).showToast?.(errMsg, 'error')
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
    const errMsg = result.error?.message ?? 'Failed to update preset'
    set({ error: errMsg })
    ;(get() as any).showToast?.(errMsg, 'error')
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
    const errMsg = result.error?.message ?? 'Failed to delete preset'
    set({ error: errMsg })
    ;(get() as any).showToast?.(errMsg, 'error')
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
    const errMsg = result.error?.message ?? 'Failed to duplicate preset'
    set({ error: errMsg })
    ;(get() as any).showToast?.(errMsg, 'error')
    return null
  },

  reorderPresets: async (items: ReorderItem[]) => {
    const api = getApi()
    if (!api) return false
    const result = await api.preset.reorder(items)
    if (result.success) {
      // Update local state with new positions so the UI re-sorts
      const posMap = new Map(items.map(i => [i.id, i.position]))
      set(state => ({
        presets: state.presets.map(p => posMap.has(p.id) ? { ...p, position: posMap.get(p.id)! } : p),
      }))
      return true
    }
    const errMsg = result.error?.message ?? 'Failed to reorder presets'
    set({ error: errMsg })
    ;(get() as any).showToast?.(errMsg, 'error')
    return false
  },

  activatePreset: async (id: string) => {
    const api = getApi()
    if (!api) return null
    set({ isLoading: true, error: null })
    const result = await api.preset.activate(id)
    if (result.success) {
      set({ activePresetId: id, isLoading: false })
    } else {
      const errMsg = result.error?.message ?? 'Failed to activate preset'
      set({ error: errMsg, isLoading: false })
      ;(get() as any).showToast?.(errMsg, 'error')
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
      const errMsg = result.error?.message ?? 'Failed to deactivate preset'
      set({ error: errMsg, isLoading: false })
      ;(get() as any).showToast?.(errMsg, 'error')
    }
    return result
  },

  selectPreset: (id: string | null) => set({ selectedPresetId: id }),

  clearError: () => set({ error: null }),
})
