import { v4 as uuidv4 } from 'uuid'
import type { Backup, PresetArchiveBackup, PreActivationBackup, Preset, SnapshotEntry } from '../../shared/types'
import { readBackupsFile, mutateBackups } from './index'

function isValidBackup(entry: unknown): entry is Backup {
  if (!entry || typeof entry !== 'object') return false
  const b = entry as Record<string, unknown>
  if (typeof b.id !== 'string') return false
  if (typeof b.kind !== 'string') return false
  if (typeof b.originalPresetId !== 'string') return false
  if (typeof b.presetName !== 'string') return false
  if (typeof b.createdAt !== 'string') return false

  if (b.kind === 'preset-archive') {
    return Array.isArray(b.variables) && (b.variables as unknown[]).every(
      v => v && typeof v === 'object' &&
        typeof (v as any).key === 'string' &&
        typeof (v as any).value === 'string'
    )
  }

  if (b.kind === 'pre-activation') {
    return Array.isArray(b.snapshot) && (b.snapshot as unknown[]).every(
      e => e && typeof e === 'object' &&
        typeof (e as any).key === 'string' &&
        typeof (e as any).existed === 'boolean'
    )
  }

  return false
}

export function listBackups(): Backup[] {
  const file = readBackupsFile()
  return file.backups.filter(isValidBackup)
}

export function getBackup(id: string): Backup | undefined {
  return listBackups().find(b => b.id === id)
}

/**
 * Archive a preset to history before it is deleted. The archived entry holds
 * the full variable snapshot so the user can restore it as a new preset later.
 */
export function archivePreset(preset: Preset): Promise<PresetArchiveBackup> {
  const backup: PresetArchiveBackup = {
    kind: 'preset-archive',
    id: uuidv4(),
    originalPresetId: preset.id,
    presetName: preset.name,
    createdAt: new Date().toISOString(),
    variables: preset.variables.map(v => ({ key: v.key, value: v.value, ...(v.isSecret !== undefined ? { isSecret: v.isSecret } : {}) })),
  }
  return mutateBackups(file => {
    const cleaned = file.backups.filter(isValidBackup)
    return {
      next: { backups: [backup, ...cleaned] },
      result: backup,
    }
  })
}

/**
 * Capture the current Windows env var state for a set of keys, creating a
 * pre-activation snapshot that lets the user roll back the activation.
 */
export function createPreActivationBackup(
  presetId: string,
  presetName: string,
  snapshot: SnapshotEntry[],
  previousActivePresetId: string | null,
  previousAppliedKeys: string[],
): Promise<PreActivationBackup> {
  const backup: PreActivationBackup = {
    kind: 'pre-activation',
    id: uuidv4(),
    originalPresetId: presetId,
    presetName,
    createdAt: new Date().toISOString(),
    snapshot,
    previousActivePresetId,
    previousAppliedKeys,
  }
  return mutateBackups(file => {
    const cleaned = file.backups.filter(isValidBackup)
    return {
      next: { backups: [backup, ...cleaned] },
      result: backup,
    }
  })
}

export function deleteBackup(id: string): Promise<boolean> {
  return mutateBackups(file => {
    const cleaned = file.backups.filter(isValidBackup)
    const idx = cleaned.findIndex(b => b.id === id)
    if (idx === -1) {
      // Still persist if we cleaned invalid entries
      if (cleaned.length !== file.backups.length) {
        return { next: { backups: cleaned }, result: false }
      }
      return { next: null, result: false }
    }
    cleaned.splice(idx, 1)
    return { next: { backups: cleaned }, result: true }
  })
}

export function deleteAllBackups(): Promise<number> {
  return mutateBackups(file => {
    const count = file.backups.filter(isValidBackup).length
    if (file.backups.length === 0) return { next: null, result: 0 }
    return { next: { backups: [] }, result: count }
  })
}
