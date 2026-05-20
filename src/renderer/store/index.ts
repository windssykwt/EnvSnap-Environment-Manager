import { create } from 'zustand'
import { createPresetSlice, PresetSlice } from './presetStore'
import { createBackupSlice, BackupSlice } from './backupStore'
import { createSettingsSlice, SettingsSlice } from './settingsStore'
import { createUiSlice, UiSlice } from './uiStore'

export type AppStore = PresetSlice & BackupSlice & SettingsSlice & UiSlice

export const useAppStore = create<AppStore>()((...a) => ({
  ...createPresetSlice(...a),
  ...createBackupSlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
}))
