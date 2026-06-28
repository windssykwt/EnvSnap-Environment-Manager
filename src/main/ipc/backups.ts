import { ipcMain } from 'electron'
import type { IpcResult, Backup, Preset } from '../../shared/types'
import { IPC } from '../../shared/constants'
import { logger } from '../logger'
import * as backupStore from '../storage/backups'
import * as presetStore from '../storage/presets'
import { broadcastSettingChange } from '../env'
import { rollbackToSnapshot } from '../activation'
import { rebuildTray } from '../tray'
import { validateId } from '../validation'
import { ok, fail, bad } from './helpers'

export function registerBackupHandlers(): void {
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
        variables: backup.variables.map(v => ({ key: v.key, value: v.value, isSecret: v.isSecret })),
      })
      rebuildTray()
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

      await presetStore.setActivePresetId(
        backup.previousActivePresetId,
        backup.previousAppliedKeys,
        null,
      )
      rebuildTray()
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
}
