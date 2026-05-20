export const IPC = {
  PRESET: {
    LIST: 'preset:list',
    GET: 'preset:get',
    CREATE: 'preset:create',
    UPDATE: 'preset:update',
    DELETE: 'preset:delete',
    DUPLICATE: 'preset:duplicate',
    ACTIVATE: 'preset:activate',
    DEACTIVATE: 'preset:deactivate',
    GET_ACTIVE_ID: 'preset:getActiveId',
  },
  BACKUP: {
    LIST: 'backup:list',
    RESTORE: 'backup:restore',
    RESTORE_PRE_ACTIVATION: 'backup:restorePreActivation',
    DELETE: 'backup:delete',
    DELETE_ALL: 'backup:deleteAll',
  },
  SETTINGS: {
    GET: 'settings:get',
    UPDATE: 'settings:update',
  },
  ENV: {
    READ_ALL: 'env:readAll',
  },
  IMPORT_EXPORT: {
    EXPORT: 'importExport:export',
    IMPORT: 'importExport:import',
    EXPORT_ONE: 'importExport:exportOne',
    IMPORT_MERGE: 'importExport:importMerge',
    PEEK: 'importExport:peek',
  },
  CONFIG: {
    EXPORT: 'config:export',
    IMPORT: 'config:import',
  },
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE_TOGGLE: 'window:maximizeToggle',
    CLOSE: 'window:close',
  },
  DIALOG: {
    OPEN_FILE: 'dialog:openFile',
    SAVE_FILE: 'dialog:saveFile',
  },
} as const

export const DEFAULT_SETTINGS = {
  launchOnStartup: false,
  minimizeToTray: true,
  showNotification: true,
  confirmBeforeApply: true,
  storageLocation: '',
  theme: 'system' as const,
}

// Valid env var name:
//   - non-empty
//   - no "=" (delimiter), no NUL, no other control chars (\x00-\x1F)
//   - no leading or trailing whitespace
//   - internal whitespace is tolerated for compatibility with legacy
//     apps that use names like "Program Files".
export const ENV_KEY_REGEX = /^[^=\0\x00-\x1F\s](?:[^=\0\x00-\x1F]*[^=\0\x00-\x1F\s])?$/

export const APP_NAME = 'EnvSnap'
