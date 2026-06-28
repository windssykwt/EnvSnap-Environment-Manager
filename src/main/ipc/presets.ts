import { ipcMain, Notification, BrowserWindow } from 'electron'
import type { IpcResult, Preset, ActivationResult } from '../../shared/types'
import { IPC } from '../../shared/constants'
import { logger } from '../logger'
import * as presetStore from '../storage/presets'
import * as backupStore from '../storage/backups'
import { applyPresetVariables, broadcastSettingChange } from '../env'
import { activatePresetDirect, rollbackToSnapshot } from '../activation'
import { getSettings } from '../storage/settings'
import { rebuildTray } from '../tray'
import {
  validateId,
  validateCreatePresetInput,
  validateUpdatePresetInput,
  validateReorderItems,
} from '../validation'
import { ok, fail, bad } from './helpers'

export function registerPresetHandlers(): void {
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
      rebuildTray()
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
      rebuildTray()
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
      rebuildTray()
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
      rebuildTray()
      return ok(preset)
    } catch (err) {
      return bad(err, 'DUPLICATE_FAILED', 'Failed to duplicate preset')
    }
  })

  ipcMain.handle(IPC.PRESET.REORDER, async (_e, items: unknown): Promise<IpcResult<boolean>> => {
    try {
      const validated = validateReorderItems(items)
      const success = await presetStore.reorderPresets(validated)
      return ok(success)
    } catch (err) {
      return bad(err, 'REORDER_FAILED', 'Failed to reorder presets')
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

      const settings = getSettings()
      if (settings.showNotification) {
        new Notification({ title: 'Notification', body: `Preset "${preset.name}" activated` }).show()
      }

      rebuildTray()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('preset:activated', preset.id)
      }
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
        await backupStore.deleteBackup(snapshot.id)
        await presetStore.setActivePresetId(null)
        rebuildTray()
        logger.info('Preset deactivated via snapshot', {
          presetId: activeId,
          restored: String(rollback.restoredCount),
          deleted: String(rollback.deletedCount),
        })
        return ok(true)
      }

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
      rebuildTray()
      logger.info('Preset deactivated', { presetId: activeId })
      return ok(true)
    } catch (err) {
      logger.error('Failed to deactivate preset', { error: String(err) })
      return fail('DEACTIVATE_FAILED', 'Failed to deactivate preset')
    }
  })
}
