import type { Preset, PreActivationBackup, SnapshotEntry } from '../shared/types'
import { logger } from './logger'
import * as presetStore from './storage/presets'
import * as backupStore from './storage/backups'
import { readAllUserEnvVars, applyPresetVariables, broadcastSettingChange } from './env'

export async function activatePresetDirect(preset: Preset): Promise<{ success: boolean; error?: string }> {
  // Allow activating empty presets to clean up all previously applied variables
  const invalidKeys = preset.variables.filter(v => !v.key.trim())
  if (invalidKeys.length > 0) {
    return { success: false, error: 'Preset contains variables with empty keys' }
  }

  try {
    const variableKeys = preset.variables.map(v => v.key)

    // Keys from the previous activation that are no longer in this preset
    const lastApplied = presetStore.getLastAppliedVariables()
    const keysToDelete = lastApplied.filter(key => !variableKeys.includes(key))

    // All keys that will be touched (written or deleted) during this activation
    const affectedKeys = [...new Set([...variableKeys, ...keysToDelete])]

    // --- Pre-activation snapshot ---
    // Read current values for all affected keys so the user can roll back.
    let snapshot: SnapshotEntry[] = []
    const previousActivePresetId = presetStore.getActivePresetId()
    const previousAppliedKeys = presetStore.getLastAppliedVariables()

    if (affectedKeys.length > 0) {
      try {
        const currentEnv = await readAllUserEnvVars()
        snapshot = affectedKeys.map(key => {
          const existed = Object.prototype.hasOwnProperty.call(currentEnv, key)
          return {
            key,
            previousValue: existed ? currentEnv[key] : null,
            existed,
          }
        })
      } catch (snapshotErr) {
        // A snapshot failure is non-fatal: log it but continue.
        // The user loses roll-back ability for this activation.
        logger.error('Failed to capture pre-activation snapshot', { error: String(snapshotErr) })
      }
    }

    // Apply the preset
    const result = await applyPresetVariables(preset.variables, keysToDelete)
    if (result.failedVariables.length > 0) {
      logger.error('Preset activation had failures', {
        presetId: preset.id,
        failedCount: String(result.failedVariables.length),
      })
      return { success: false, error: 'Failed to apply preset. One or more variables were invalid or could not be written.' }
    }

    await broadcastSettingChange()

    // Persist snapshot now that we know the apply succeeded
    let snapshotBackupId: string | null = null
    if (snapshot.length > 0) {
      const backup = await backupStore.createPreActivationBackup(
        preset.id,
        preset.name,
        snapshot,
        previousActivePresetId,
        previousAppliedKeys,
      )
      snapshotBackupId = backup.id
    }

    await presetStore.setActivePresetId(preset.id, variableKeys, snapshotBackupId)
    logger.info('Preset activated', {
      presetId: preset.id,
      appliedCount: String(result.appliedCount),
      deletedCount: String(keysToDelete.length),
    })

    return { success: true }
  } catch (err) {
    logger.error('Failed to activate preset', { error: String(err) })
    return { success: false, error: 'Failed to apply preset. Some variables could not be written.' }
  }
}

/**
 * Roll back a pre-activation snapshot: restore previous values and delete
 * variables that didn't exist before the activation.
 */
export async function rollbackToSnapshot(
  backup: PreActivationBackup,
): Promise<{ success: boolean; error?: string; restoredCount: number; deletedCount: number }> {
  const toRestore = backup.snapshot.filter(e => e.existed && e.previousValue !== null)
  const toDelete = backup.snapshot.filter(e => !e.existed)

  const restoreVars = toRestore.map(e => ({ key: e.key, value: e.previousValue! }))
  const deleteKeys = toDelete.map(e => e.key)

  const result = await applyPresetVariables(restoreVars, deleteKeys)
  if (result.failedVariables.length > 0) {
    return {
      success: false,
      error: 'Failed to fully restore previous values. Some variables could not be written.',
      restoredCount: 0,
      deletedCount: 0,
    }
  }

  return {
    success: true,
    restoredCount: toRestore.length,
    deletedCount: toDelete.length,
  }
}
