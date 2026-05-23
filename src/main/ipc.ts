import { ipcMain, dialog, BrowserWindow, Notification } from 'electron'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import type { IpcResult, Preset, Backup, PreActivationBackup, Settings, ActivationResult, AppConfigExport, DataFile, BackupsFile } from '../shared/types'
import { IPC, DEFAULT_SETTINGS } from '../shared/constants'
import { logger } from './logger'
import * as presetStore from './storage/presets'
import * as backupStore from './storage/backups'
import * as settingsStore from './storage/settings'
import { readDataFile, writeDataFile, readBackupsFile, writeBackupsFile } from './storage'
import { readAllUserEnvVars, applyPresetVariables, broadcastSettingChange } from './env'
import { activatePresetDirect, rollbackToSnapshot } from './activation'
import { buildTrayMenu } from './tray'
import { setLaunchOnStartup } from './startup'
import {
  ValidationError,
  validateCreatePresetInput,
  validateUpdatePresetInput,
  validateImportPresets,
  validateImportMergeVariables,
  validateConfigImport,
  validateId,
  validateIdArray,
  validateSettingsPartial,
  validateDialogFilters,
  readImportFileBounded,
} from './validation'

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

function fail(code: string, message: string, details?: string): IpcResult<never> {
  return { success: false, error: { code, message, details } }
}

/**
 * Wrap a handler so that ValidationError is mapped to a clean IPC fail
 * response and any unexpected thrown error is logged but not leaked
 * verbatim to the renderer.
 */
function bad(err: unknown, fallbackCode: string, fallbackMessage: string): IpcResult<never> {
  if (err instanceof ValidationError) {
    return fail(err.code, err.message)
  }
  logger.error(fallbackMessage, { error: String(err) })
  return fail(fallbackCode, fallbackMessage)
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.WINDOW.MINIMIZE, async (): Promise<IpcResult<boolean>> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return fail('NO_WINDOW', 'No active window')
    win.minimize()
    return ok(true)
  })

  ipcMain.handle(IPC.WINDOW.MAXIMIZE_TOGGLE, async (): Promise<IpcResult<boolean>> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return fail('NO_WINDOW', 'No active window')
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return ok(true)
  })

  ipcMain.handle(IPC.WINDOW.CLOSE, async (): Promise<IpcResult<boolean>> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return fail('NO_WINDOW', 'No active window')
    win.close()
    return ok(true)
  })

  ipcMain.handle(IPC.PRESET.LIST, async (): Promise<IpcResult<Preset[]>> => {
    try {
      return ok(presetStore.listPresets())
    } catch (err) {
      logger.error('Failed to list presets')
      return fail('LIST_FAILED', 'Failed to load presets')
    }
  })

  ipcMain.handle(IPC.PRESET.GET, async (_e, id: unknown): Promise<IpcResult<Preset | null>> => {
    try {
      const presetId = validateId(id)
      const preset = presetStore.getPreset(presetId)
      return ok(preset ?? null)
    } catch (err) {
      return bad(err, 'GET_FAILED', 'Failed to get preset')
    }
  })

  ipcMain.handle(IPC.PRESET.CREATE, async (_e, input: unknown): Promise<IpcResult<Preset>> => {
    try {
      const validated = validateCreatePresetInput(input)
      const preset = await presetStore.createPreset(validated)
      logger.info('Preset created', { name: preset.name })
      buildTrayMenu()
      return ok(preset)
    } catch (err) {
      return bad(err, 'CREATE_FAILED', 'Failed to create preset')
    }
  })

  ipcMain.handle(IPC.PRESET.UPDATE, async (_e, id: unknown, input: unknown): Promise<IpcResult<Preset | null>> => {
    try {
      const presetId = validateId(id)
      const validated = validateUpdatePresetInput(input)
      const preset = await presetStore.updatePreset(presetId, validated)
      if (!preset) return fail('NOT_FOUND', 'Preset not found')
      logger.info('Preset updated', { id: presetId })
      buildTrayMenu()
      return ok(preset)
    } catch (err) {
      return bad(err, 'UPDATE_FAILED', 'Failed to update preset')
    }
  })

  ipcMain.handle(IPC.PRESET.DELETE, async (_e, id: unknown): Promise<IpcResult<boolean>> => {
    try {
      const presetId = validateId(id)
      const preset = presetStore.getPreset(presetId)
      if (!preset) return fail('NOT_FOUND', 'Preset not found')

      // If the preset being deleted is currently active in Windows we
      // need to undo its effects. Prefer rolling back via the snapshot
      // we took at activation time so we don't delete variables the
      // user owned before activation. Fall back to the legacy "delete
      // all applied keys" path only if the snapshot is gone.
      const isActive = presetStore.getActivePresetId() === presetId
      if (isActive) {
        const snapshotId = presetStore.getActiveSnapshotBackupId()
        const snapshot = snapshotId ? backupStore.getBackup(snapshotId) : undefined
        if (snapshot && snapshot.kind === 'pre-activation') {
          const rollback = await rollbackToSnapshot(snapshot)
          if (!rollback.success) {
            logger.error('Failed to roll back snapshot before delete', {
              presetId,
              error: rollback.error ?? '',
            })
            return fail('DELETE_FAILED', rollback.error ?? 'Failed to remove environment variables from Windows. Preset was not deleted.')
          }
          await broadcastSettingChange()
          await backupStore.deleteBackup(snapshot.id)
        } else {
          logger.warn('Deleting active preset without snapshot — pre-existing values may be lost', {
            presetId,
          })
          const keysToDelete = presetStore.getLastAppliedVariables()
          if (keysToDelete.length > 0) {
            const result = await applyPresetVariables([], keysToDelete)
            if (result.failedVariables.length > 0) {
              logger.error('Failed to clean up env vars before delete', {
                presetId,
                failedCount: String(result.failedVariables.length),
              })
              return fail('DELETE_FAILED', 'Failed to remove environment variables from Windows. Preset was not deleted. Please check your permissions and try again.')
            }
            await broadcastSettingChange()
          }
        }
      }

      const deleted = await presetStore.deletePreset(presetId)
      if (!deleted) return fail('NOT_FOUND', 'Preset not found')
      logger.info('Preset deleted', { id: presetId, wasActive: String(isActive) })
      buildTrayMenu()
      return ok(true)
    } catch (err) {
      return bad(err, 'DELETE_FAILED', 'Failed to delete preset')
    }
  })

  ipcMain.handle(IPC.PRESET.DUPLICATE, async (_e, id: unknown): Promise<IpcResult<Preset | null>> => {
    try {
      const presetId = validateId(id)
      const preset = await presetStore.duplicatePreset(presetId)
      if (!preset) return fail('NOT_FOUND', 'Preset not found')
      logger.info('Preset duplicated', { id: presetId })
      buildTrayMenu()
      return ok(preset)
    } catch (err) {
      return bad(err, 'DUPLICATE_FAILED', 'Failed to duplicate preset')
    }
  })

  ipcMain.handle(IPC.PRESET.ACTIVATE, async (_e, id: unknown): Promise<IpcResult<ActivationResult>> => {
    try {
      const presetId = validateId(id)
      const preset = presetStore.getPreset(presetId)
      if (!preset) return fail('NOT_FOUND', 'Preset not found')

      const result = await activatePresetDirect(preset)
      if (!result.success) {
        return fail('ACTIVATION_FAILED', result.error ?? 'Activation failed')
      }

      const settings = settingsStore.getSettings()
      if (settings.showNotification) {
        new Notification({ title: 'EnvSnap', body: `Preset "${preset.name}" activated` }).show()
      }

      buildTrayMenu()

      return ok({ appliedCount: preset.variables.length, failedVariables: [] })
    } catch (err) {
      return bad(err, 'ACTIVATION_FAILED', 'Failed to apply preset. Some variables could not be written. Please check your Windows permissions and try again.')
    }
  })

  ipcMain.handle(IPC.PRESET.GET_ACTIVE_ID, async (): Promise<IpcResult<string | null>> => {
    try {
      return ok(presetStore.getActivePresetId())
    } catch (err) {
      return fail('GET_FAILED', 'Failed to get active preset ID')
    }
  })

  ipcMain.handle(IPC.PRESET.DEACTIVATE, async (): Promise<IpcResult<boolean>> => {
    try {
      const activeId = presetStore.getActivePresetId()
      if (!activeId) return fail('NO_ACTIVE', 'No preset is currently active')

      // Prefer rolling back via the snapshot we took at activation time
      // so we never delete a variable the user owned before we touched
      // it. Fall back to the legacy "delete all applied keys" path only
      // when the snapshot is missing (e.g. the user cleared history),
      // and warn loudly so it's visible in the log.
      const snapshotId = presetStore.getActiveSnapshotBackupId()
      const snapshot = snapshotId ? backupStore.getBackup(snapshotId) : undefined

      if (snapshot && snapshot.kind === 'pre-activation') {
        const rollback = await rollbackToSnapshot(snapshot)
        if (!rollback.success) {
          logger.error('Failed to deactivate preset (snapshot rollback)', {
            presetId: activeId,
            error: rollback.error ?? '',
          })
          return fail('DEACTIVATE_FAILED', rollback.error ?? 'Failed to deactivate preset')
        }
        await broadcastSettingChange()
        // Also drop the snapshot itself from history — its purpose is
        // exhausted now that we've rolled it back.
        await backupStore.deleteBackup(snapshot.id)
        await presetStore.setActivePresetId(null)
        buildTrayMenu()
        logger.info('Preset deactivated via snapshot', {
          presetId: activeId,
          restored: String(rollback.restoredCount),
          deleted: String(rollback.deletedCount),
        })
        return ok(true)
      }

      // Legacy fallback: blind-delete the keys we applied. This loses
      // any pre-existing user-owned values for those keys, so we warn.
      logger.warn('Deactivating without snapshot — pre-existing values may be lost', {
        presetId: activeId,
      })
      const keysToDelete = presetStore.getLastAppliedVariables()
      if (keysToDelete.length > 0) {
        const result = await applyPresetVariables([], keysToDelete)
        if (result.failedVariables.length > 0) {
          logger.error('Failed to deactivate preset', {
            presetId: activeId,
            failedCount: String(result.failedVariables.length),
          })
          return fail('DEACTIVATE_FAILED', 'Failed to remove environment variables from Windows. Please check your permissions and try again.')
        }
        await broadcastSettingChange()
      }

      await presetStore.setActivePresetId(null)
      buildTrayMenu()
      logger.info('Preset deactivated', { presetId: activeId })
      return ok(true)
    } catch (err) {
      logger.error('Failed to deactivate preset', { error: String(err) })
      return fail('DEACTIVATE_FAILED', 'Failed to deactivate preset')
    }
  })

  ipcMain.handle(IPC.BACKUP.LIST, async (): Promise<IpcResult<Backup[]>> => {
    try {
      return ok(backupStore.listBackups())
    } catch (err) {
      return fail('LIST_FAILED', 'Failed to load backups')
    }
  })

  ipcMain.handle(IPC.BACKUP.RESTORE, async (_e, id: unknown): Promise<IpcResult<Preset>> => {
    try {
      const backupId = validateId(id)
      const backup = backupStore.getBackup(backupId)
      if (!backup) return fail('NOT_FOUND', 'Backup not found')
      if (backup.kind !== 'preset-archive') {
        return fail('WRONG_KIND', 'This entry is a pre-activation snapshot. Use the rollback action instead.')
      }

      // The backup carries the preset's full variable snapshot from the
      // moment it was deleted. Recreate a preset with the same variables.
      // Auto-suffix the name if a preset with the original name still exists,
      // so we never silently overwrite the user's current state.
      const baseName = backup.presetName
      const existingNames = new Set(presetStore.listPresets().map(p => p.name))
      let name = baseName
      let suffix = 2
      while (existingNames.has(name)) {
        name = `${baseName} (${suffix})`
        suffix++
      }

      const preset = await presetStore.createPreset({
        name,
        variables: backup.variables.map(v => ({ key: v.key, value: v.value })),
      })
      buildTrayMenu()
      logger.info('Backup restored to preset', { backupId, presetId: preset.id })

      return ok(preset)
    } catch (err) {
      return bad(err, 'RESTORE_FAILED', 'Failed to restore backup. Please try again.')
    }
  })

  ipcMain.handle(IPC.BACKUP.RESTORE_PRE_ACTIVATION, async (_e, id: unknown): Promise<IpcResult<{ restoredCount: number; deletedCount: number }>> => {
    try {
      const backupId = validateId(id)
      const backup = backupStore.getBackup(backupId)
      if (!backup) return fail('NOT_FOUND', 'Snapshot not found')
      if (backup.kind !== 'pre-activation') {
        return fail('WRONG_KIND', 'This entry is a deleted preset. Use Restore to bring it back as a preset.')
      }

      const rollback = await rollbackToSnapshot(backup)
      if (!rollback.success) {
        logger.error('Failed to restore pre-activation snapshot', {
          backupId,
          error: rollback.error ?? '',
        })
        return fail('RESTORE_FAILED', rollback.error ?? 'Failed to restore previous environment state.')
      }
      await broadcastSettingChange()

      // Roll the app's "active preset" pointer back to whatever it was
      // before the activation we are undoing. The backup carries that.
      // The snapshot itself stays in history because the user invoked
      // it manually — they may want to inspect it again.
      await presetStore.setActivePresetId(
        backup.previousActivePresetId,
        backup.previousAppliedKeys,
        // We don't have the snapshot id of the activation that came
        // *before* the one we just rolled back, so the next deactivate
        // will fall back to the legacy path. That's the best we can do
        // without keeping a stack of snapshots.
        null,
      )
      buildTrayMenu()
      logger.info('Pre-activation snapshot restored', {
        backupId,
        restored: String(rollback.restoredCount),
        deleted: String(rollback.deletedCount),
      })
      return ok({ restoredCount: rollback.restoredCount, deletedCount: rollback.deletedCount })
    } catch (err) {
      return bad(err, 'RESTORE_FAILED', 'Failed to restore previous environment state. Please try again.')
    }
  })

  ipcMain.handle(IPC.BACKUP.DELETE, async (_e, id: unknown): Promise<IpcResult<boolean>> => {
    try {
      const backupId = validateId(id)
      const deleted = await backupStore.deleteBackup(backupId)
      if (!deleted) return fail('NOT_FOUND', 'Backup not found')
      logger.info('Backup deleted', { backupId })
      return ok(true)
    } catch (err) {
      return bad(err, 'DELETE_FAILED', 'Failed to delete backup')
    }
  })

  ipcMain.handle(IPC.BACKUP.DELETE_ALL, async (): Promise<IpcResult<{ deleted: number }>> => {
    try {
      const deleted = await backupStore.deleteAllBackups()
      logger.info('All backups deleted', { count: String(deleted) })
      return ok({ deleted })
    } catch (err) {
      logger.error('Failed to delete all backups', { error: String(err) })
      return fail('DELETE_FAILED', 'Failed to delete all backups')
    }
  })

  ipcMain.handle(IPC.SETTINGS.GET, async (): Promise<IpcResult<Settings>> => {
    try {
      return ok(settingsStore.getSettings())
    } catch (err) {
      return fail('GET_FAILED', 'Failed to load settings')
    }
  })

  ipcMain.handle(IPC.SETTINGS.UPDATE, async (_e, partial: unknown): Promise<IpcResult<Settings>> => {
    try {
      const validated = validateSettingsPartial(partial)
      const prev = settingsStore.getSettings()
      const updated = await settingsStore.updateSettings(validated as Partial<Settings>)

      if (validated.launchOnStartup !== undefined && validated.launchOnStartup !== prev.launchOnStartup) {
        setLaunchOnStartup(updated.launchOnStartup)
      }

      logger.info('Settings updated')
      return ok(updated)
    } catch (err) {
      return bad(err, 'UPDATE_FAILED', 'Failed to update settings')
    }
  })

  ipcMain.handle(IPC.ENV.READ_ALL, async (): Promise<IpcResult<Record<string, string>>> => {
    try {
      const vars = await readAllUserEnvVars()
      return ok(vars)
    } catch (err) {
      logger.error('Failed to read env vars')
      return fail('READ_FAILED', 'Failed to read Windows environment variables')
    }
  })

  ipcMain.handle(IPC.DIALOG.OPEN_FILE, async (_e, opts: unknown): Promise<IpcResult<string | null>> => {
    try {
      const validated = validateDialogFilters(opts)
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: validated?.filters ?? [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return ok(null)
      return ok(result.filePaths[0])
    } catch (err) {
      return bad(err, 'DIALOG_FAILED', 'Failed to open file dialog')
    }
  })

  ipcMain.handle(IPC.DIALOG.SAVE_FILE, async (_e, opts: unknown): Promise<IpcResult<string | null>> => {
    try {
      const validated = validateDialogFilters(opts)
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showSaveDialog(win!, {
        filters: validated?.filters ?? [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: validated?.defaultPath,
      })
      if (result.canceled) return ok(null)
      return ok(result.filePath ?? null)
    } catch (err) {
      return bad(err, 'DIALOG_FAILED', 'Failed to save file dialog')
    }
  })

  ipcMain.handle(IPC.IMPORT_EXPORT.EXPORT, async (_e, ids: unknown): Promise<IpcResult<boolean>> => {
    try {
      const validatedIds = validateIdArray(ids)
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showSaveDialog(win!, {
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: `envchanger-presets-${new Date().toISOString().slice(0, 10)}.json`,
      })
      if (result.canceled || !result.filePath) return ok(false)

      const allPresets = presetStore.listPresets()
      const selected = validatedIds.length > 0
        ? allPresets.filter(p => validatedIds.includes(p.id))
        : allPresets

      const exportData = { presets: selected }
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      logger.info('Presets exported', { count: String(selected.length) })
      return ok(true)
    } catch (err) {
      return bad(err, 'EXPORT_FAILED', 'Failed to export presets to file')
    }
  })

  ipcMain.handle(IPC.IMPORT_EXPORT.EXPORT_ONE, async (_e, id: unknown): Promise<IpcResult<boolean>> => {
    try {
      const presetId = validateId(id)
      const preset = presetStore.getPreset(presetId)
      if (!preset) return fail('NOT_FOUND', 'Preset not found')

      const win = BrowserWindow.getFocusedWindow()
      const safeName = preset.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'preset'
      const result = await dialog.showSaveDialog(win!, {
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: `${safeName}.json`,
      })
      if (result.canceled || !result.filePath) return ok(false)

      const exportData = { presets: [preset] }
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      logger.info('Preset exported', { id: presetId })
      return ok(true)
    } catch (err) {
      return bad(err, 'EXPORT_FAILED', 'Failed to export preset to file')
    }
  })

  ipcMain.handle(IPC.IMPORT_EXPORT.IMPORT_MERGE, async (_e, id: unknown): Promise<IpcResult<{ added: number; updated: number }>> => {
    try {
      const presetId = validateId(id)
      const preset = presetStore.getPreset(presetId)
      if (!preset) return fail('NOT_FOUND', 'Preset not found')

      const win = BrowserWindow.getFocusedWindow()
      const dialogResult = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return ok({ added: 0, updated: 0 })
      }

      const filePath = dialogResult.filePaths[0]
      const raw = await readImportFileBounded(filePath)
      const data = JSON.parse(raw)
      const incoming = validateImportMergeVariables(data)

      if (incoming.length === 0) {
        return fail('NO_VARIABLES', 'No valid variables found in the selected file.')
      }

      // Merge — incoming overwrites existing keys, new keys are appended.
      const merged = preset.variables.map(v => ({ ...v }))
      const indexByKey = new Map(merged.map((v, i) => [v.key, i]))
      let added = 0
      let updated = 0
      for (const v of incoming) {
        const idx = indexByKey.get(v.key)
        if (idx === undefined) {
          merged.push({ key: v.key, value: v.value, ...(v.isSecret !== undefined ? { isSecret: v.isSecret } : {}) })
          indexByKey.set(v.key, merged.length - 1)
          added++
        } else {
          if (merged[idx].value !== v.value) updated++
          merged[idx] = { key: v.key, value: v.value, ...(v.isSecret !== undefined ? { isSecret: v.isSecret } : {}) }
        }
      }

      await presetStore.updatePreset(presetId, { variables: merged })
      buildTrayMenu()
      logger.info('Preset merged from file', { id: presetId, added: String(added), updated: String(updated) })
      return ok({ added, updated })
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import variables. Please check the file format.')
    }
  })

  ipcMain.handle(IPC.IMPORT_EXPORT.IMPORT, async (): Promise<IpcResult<{ imported: number; skipped: number }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const dialogResult = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) return ok({ imported: 0, skipped: 0 })

      const filePath = dialogResult.filePaths[0]
      const raw = await readImportFileBounded(filePath)
      const data = JSON.parse(raw)
      const validated = validateImportPresets(data)

      let imported = 0
      for (const p of validated.presets) {
        await presetStore.createPreset({ name: p.name, variables: p.variables })
        imported++
      }

      buildTrayMenu()
      logger.info('Presets imported', { count: String(imported), skipped: String(validated.skipped) })
      return ok({ imported, skipped: validated.skipped })
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import presets. Please check the file format.')
    }
  })

  /**
   * Open a file dialog, validate the chosen file in the main process,
   * and return a renderer-friendly summary. Used by ImportDialog to
   * preview without ever reading the file from the renderer.
   */
  ipcMain.handle(IPC.IMPORT_EXPORT.PEEK, async (): Promise<IpcResult<{
    filePath: string
    summary: Array<{ name: string; variableCount: number }>
    skipped: number
  } | null>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const dialogResult = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return ok(null)
      }
      const filePath = dialogResult.filePaths[0]
      const raw = await readImportFileBounded(filePath)
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      const validated = validateImportPresets(parsed)
      const summary = validated.presets.map(p => ({
        name: p.name,
        variableCount: p.variables.length,
      }))
      return ok({ filePath, summary, skipped: validated.skipped })
    } catch (err) {
      return bad(err, 'PEEK_FAILED', 'Failed to read the selected file.')
    }
  })

  ipcMain.handle(IPC.CONFIG.EXPORT, async (): Promise<IpcResult<boolean>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showSaveDialog(win!, {
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: `envchanger-config-${new Date().toISOString().slice(0, 10)}.json`,
      })
      if (result.canceled || !result.filePath) return ok(false)

      const exportData: AppConfigExport = {
        data: readDataFile(),
        backups: readBackupsFile(),
      }

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      logger.info('Config exported')
      return ok(true)
    } catch (err) {
      logger.error('Failed to export config', { error: String(err) })
      return fail('EXPORT_FAILED', 'Failed to export configuration')
    }
  })

  ipcMain.handle(IPC.CONFIG.IMPORT, async (): Promise<IpcResult<boolean>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const dialogResult = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) return ok(false)

      const filePath = dialogResult.filePaths[0]
      const raw = await readImportFileBounded(filePath)
      const parsed = JSON.parse(raw)
      const validated = validateConfigImport(parsed)

      // Re-create presets with fresh ids so an imported file can never
      // re-use an id that's currently active in the user's data. Map
      // any references (activePresetId, lastAppliedVariables, backups)
      // through this rename table.
      const idRemap = new Map<string, string>()
      const newPresets: Preset[] = []
      const now = new Date().toISOString()
      for (const p of validated.presets) {
        const newId = randomUUID()
        // Preserve the original id from the file if present, so we can
        // remap the activePresetId/backup references below. The validator
        // already dropped malformed presets but did not preserve ids;
        // we generate fresh ones intentionally.
        newPresets.push({
          id: newId,
          name: p.name,
          variables: p.variables,
          createdAt: now,
          updatedAt: now,
        })
      }

      // Map old activePresetId by index-position match (validated.presets
      // preserves order). If the original id was a string, use the same
      // ordinal slot in newPresets if available.
      let activePresetId: string | null = null
      if (validated.activePresetId) {
        // We can't reliably remap because we lost ids during validation.
        // Be safe: drop the active preset pointer.
        activePresetId = null
      }
      void idRemap // reserved for future, when we preserve original ids

      const data: DataFile = {
        presets: newPresets,
        activePresetId,
        // Don't carry over lastAppliedVariables — those reference the
        // *previous* machine's Windows state, not this one. Importing
        // them and later activating/deactivating could delete env vars
        // the user owns directly.
        lastAppliedVariables: [],
        settings: { ...DEFAULT_SETTINGS, ...validated.settings },
      }

      const backups: BackupsFile = {
        // Pass through raw entries; storage normalisation will drop any
        // that don't match the current schema on first read.
        backups: validated.backups as BackupsFile['backups'],
      }

      await writeDataFile(data)
      await writeBackupsFile(backups)
      buildTrayMenu()
      logger.info('Config imported', {
        presets: String(newPresets.length),
      })
      return ok(true)
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import configuration. Please check the file format.')
    }
  })
}
