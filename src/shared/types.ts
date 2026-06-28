export interface Variable {
  /** Stable unique identifier for React key tracking. Generated client-side. */
  _uid?: string
  key: string
  value: string
  /** When true, the value is treated as sensitive (API key, token, etc.) and masked in the UI. */
  isSecret?: boolean
}

export interface Preset {
  id: string
  name: string
  /** Empty string means ungrouped. */
  group: string
  /** Sort order within group. Lower = higher. Assigned in steps of 1 by reorder. */
  position: number
  variables: Variable[]
  createdAt: string
  updatedAt: string
  /** Pinned presets float above all folder groups. */
  isPinned?: boolean
}

/**
 * Snapshot of a single environment variable's state at a point in time.
 * `existed: false` means the variable did not exist in Windows before the
 * preset was applied, so it should be deleted again on rollback.
 */
export interface SnapshotEntry {
  key: string
  previousValue: string | null
  existed: boolean
}

/**
 * Archived preset — created when the user deletes a preset. Restoring it
 * re-creates the preset in the user's list (does not touch Windows env vars).
 */
export interface PresetArchiveBackup {
  kind: 'preset-archive'
  id: string
  originalPresetId: string
  presetName: string
  createdAt: string
  variables: Variable[]
}

/**
 * Pre-activation snapshot — created just before a preset is activated.
 * Stores the previous Windows env var state so the user can roll back.
 */
export interface PreActivationBackup {
  kind: 'pre-activation'
  id: string
  originalPresetId: string
  presetName: string
  createdAt: string
  /** Per-key previous state of every variable that will be written or deleted. */
  snapshot: SnapshotEntry[]
  /** Active preset id immediately before this activation, or null. */
  previousActivePresetId: string | null
  /** Keys tracked as "last applied" immediately before this activation. */
  previousAppliedKeys: string[]
}

export type Backup = PresetArchiveBackup | PreActivationBackup

export type ThemeMode = 'light' | 'dark' | 'system'

export interface Settings {
  launchOnStartup: boolean
  minimizeToTray: boolean
  showNotification: boolean
  confirmBeforeApply: boolean
  storageLocation: string
  theme: ThemeMode
}

export interface DataFile {
  presets: Preset[]
  activePresetId: string | null
  lastAppliedVariables?: string[]
  /**
   * Id of the pre-activation backup taken right before the active preset
   * was applied. Used to roll back env vars on deactivate without deleting
   * variables the user owned before we touched them.
   */
  activeSnapshotBackupId?: string | null
  settings: Settings
}

export interface BackupsFile {
  backups: Backup[]
}

export interface AppConfigExport {
  data: DataFile
  backups: BackupsFile
}

export interface ProfileExport {
  version: number
  appName: string
  exportedAt: string
  presets: Preset[]
  folderNames: string[]
}

export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: string
  }
}

export interface ActivationResult {
  appliedCount: number
  failedVariables: Array<{ key: string; reason: string }>
}

export type CreatePresetInput = { name: string; group?: string; variables?: Variable[] }
export type UpdatePresetInput = { name?: string; group?: string; position?: number; variables?: Variable[]; isPinned?: boolean }

/** A single item in a reorder batch. */
export interface ReorderItem {
  id: string
  position: number
}
