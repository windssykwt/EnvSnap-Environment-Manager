import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'

const api = {
  preset: {
    list: () => ipcRenderer.invoke(IPC.PRESET.LIST),
    get: (id: string) => ipcRenderer.invoke(IPC.PRESET.GET, id),
    create: (data: { name: string; group?: string; variables?: Array<{ key: string; value: string; isSecret?: boolean }> }) =>
      ipcRenderer.invoke(IPC.PRESET.CREATE, data),
    update: (id: string, data: { name?: string; group?: string; variables?: Array<{ key: string; value: string; isSecret?: boolean }> }) =>
      ipcRenderer.invoke(IPC.PRESET.UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(IPC.PRESET.DELETE, id),
    duplicate: (id: string) => ipcRenderer.invoke(IPC.PRESET.DUPLICATE, id),
    reorder: (items: Array<{ id: string; position: number }>) => ipcRenderer.invoke(IPC.PRESET.REORDER, items),
    activate: (id: string) => ipcRenderer.invoke(IPC.PRESET.ACTIVATE, id),
    deactivate: () => ipcRenderer.invoke(IPC.PRESET.DEACTIVATE),
    getActiveId: () => ipcRenderer.invoke(IPC.PRESET.GET_ACTIVE_ID),
  },
  backup: {
    list: () => ipcRenderer.invoke(IPC.BACKUP.LIST),
    restore: (id: string) => ipcRenderer.invoke(IPC.BACKUP.RESTORE, id),
    restorePreActivation: (id: string) => ipcRenderer.invoke(IPC.BACKUP.RESTORE_PRE_ACTIVATION, id),
    delete: (id: string) => ipcRenderer.invoke(IPC.BACKUP.DELETE, id),
    deleteAll: () => ipcRenderer.invoke(IPC.BACKUP.DELETE_ALL),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS.GET),
    update: (data: Record<string, unknown>) => ipcRenderer.invoke(IPC.SETTINGS.UPDATE, data),
    getDefaultPath: () => ipcRenderer.invoke(IPC.SETTINGS.GET_DEFAULT_PATH),
  },
  env: {
    readAll: () => ipcRenderer.invoke(IPC.ENV.READ_ALL),
  },
  importExport: {
    exportPresets: (ids: string[]) => ipcRenderer.invoke(IPC.IMPORT_EXPORT.EXPORT, ids),
    importPresets: () => ipcRenderer.invoke(IPC.IMPORT_EXPORT.IMPORT),
    exportOne: (id: string) => ipcRenderer.invoke(IPC.IMPORT_EXPORT.EXPORT_ONE, id),
    importMerge: (id: string) => ipcRenderer.invoke(IPC.IMPORT_EXPORT.IMPORT_MERGE, id),
    peek: () => ipcRenderer.invoke(IPC.IMPORT_EXPORT.PEEK),
  },
  config: {
    exportConfig: () => ipcRenderer.invoke(IPC.CONFIG.EXPORT),
    importConfig: () => ipcRenderer.invoke(IPC.CONFIG.IMPORT),
  },
  profile: {
    export: (folderNames: string[]) => ipcRenderer.invoke(IPC.PROFILE.EXPORT, folderNames),
    import: () => ipcRenderer.invoke(IPC.PROFILE.IMPORT),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.WINDOW.MINIMIZE),
    maximizeToggle: () => ipcRenderer.invoke(IPC.WINDOW.MAXIMIZE_TOGGLE),
    close: () => ipcRenderer.invoke(IPC.WINDOW.CLOSE),
    relaunch: () => ipcRenderer.invoke(IPC.WINDOW.RELAUNCH),
  },
  dialog: {
    openFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke(IPC.DIALOG.OPEN_FILE, opts),
    saveFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }>; defaultPath?: string }) =>
      ipcRenderer.invoke(IPC.DIALOG.SAVE_FILE, opts),
    openDirectory: () => ipcRenderer.invoke(IPC.DIALOG.OPEN_DIRECTORY),
  },
  onPresetActivated: (callback: (presetId: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, presetId: string) => callback(presetId)
    ipcRenderer.on('preset:activated', handler)
    return () => ipcRenderer.removeListener('preset:activated', handler)
  },
}

contextBridge.exposeInMainWorld('envApi', api)
