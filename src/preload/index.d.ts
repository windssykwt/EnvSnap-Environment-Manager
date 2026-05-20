import type { IpcResult, Preset, Backup, Settings } from '../shared/types'

export interface EnvApi {
  preset: {
    list: () => Promise<IpcResult<Preset[]>>
    get: (id: string) => Promise<IpcResult<Preset | null>>
    create: (data: { name: string; variables?: Array<{ key: string; value: string }> }) => Promise<IpcResult<Preset>>
    update: (id: string, data: { name?: string; variables?: Array<{ key: string; value: string }> }) => Promise<IpcResult<Preset | null>>
    delete: (id: string) => Promise<IpcResult<boolean>>
    duplicate: (id: string) => Promise<IpcResult<Preset | null>>
    activate: (id: string) => Promise<IpcResult<unknown>>
    deactivate: () => Promise<IpcResult<boolean>>
    getActiveId: () => Promise<IpcResult<string | null>>
  }
  backup: {
    list: () => Promise<IpcResult<Backup[]>>
    restore: (id: string) => Promise<IpcResult<Preset>>
    restorePreActivation: (id: string) => Promise<IpcResult<{ restoredCount: number; deletedCount: number }>>
    delete: (id: string) => Promise<IpcResult<boolean>>
    deleteAll: () => Promise<IpcResult<{ deleted: number }>>
  }
  settings: {
    get: () => Promise<IpcResult<Settings>>
    update: (data: Partial<Settings>) => Promise<IpcResult<Settings>>
  }
  env: {
    readAll: () => Promise<IpcResult<Record<string, string>>>
  }
  importExport: {
    exportPresets: (ids: string[]) => Promise<IpcResult<boolean>>
    importPresets: () => Promise<IpcResult<{ imported: number; skipped: number }>>
    exportOne: (id: string) => Promise<IpcResult<boolean>>
    importMerge: (id: string) => Promise<IpcResult<{ added: number; updated: number }>>
    peek: () => Promise<IpcResult<{
      filePath: string
      summary: Array<{ name: string; variableCount: number }>
      skipped: number
    } | null>>
  }
  config: {
    exportConfig: () => Promise<IpcResult<boolean>>
    importConfig: () => Promise<IpcResult<boolean>>
  }
  window: {
    minimize: () => Promise<IpcResult<boolean>>
    maximizeToggle: () => Promise<IpcResult<boolean>>
    close: () => Promise<IpcResult<boolean>>
  }
  dialog: {
    openFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<IpcResult<string | null>>
    saveFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }>; defaultPath?: string }) => Promise<IpcResult<string | null>>
  }
  onPresetActivated: (callback: (presetId: string) => void) => () => void
}

declare global {
  interface Window {
    envApi: EnvApi
  }
}