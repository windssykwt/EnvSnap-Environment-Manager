import { registerWindowHandlers } from './window'
import { registerPresetHandlers } from './presets'
import { registerBackupHandlers } from './backups'
import { registerSettingsHandlers } from './settings'
import { registerEnvHandlers } from './env'
import { registerDialogHandlers } from './dialog'
import { registerImportExportHandlers } from './importExport'

export function registerIpcHandlers(): void {
  registerWindowHandlers()
  registerPresetHandlers()
  registerBackupHandlers()
  registerSettingsHandlers()
  registerEnvHandlers()
  registerDialogHandlers()
  registerImportExportHandlers()
}
