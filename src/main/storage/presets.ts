import { v4 as uuidv4 } from 'uuid'
import type { Preset, CreatePresetInput, UpdatePresetInput } from '../../shared/types'
import { mutateData, readDataFile } from './index'
import { archivePreset } from './backups'

export function listPresets(): Preset[] {
  return readDataFile().presets
}

export function getPreset(id: string): Preset | undefined {
  return readDataFile().presets.find(p => p.id === id)
}

export function createPreset(input: CreatePresetInput): Promise<Preset> {
  const now = new Date().toISOString()
  const preset: Preset = {
    id: uuidv4(),
    name: input.name,
    variables: input.variables ?? [],
    createdAt: now,
    updatedAt: now,
  }
  return mutateData(data => {
    const next = { ...data, presets: [...data.presets, preset] }
    return { next, result: preset }
  })
}

export function updatePreset(id: string, input: UpdatePresetInput): Promise<Preset | null> {
  return mutateData(data => {
    const idx = data.presets.findIndex(p => p.id === id)
    if (idx === -1) return { next: null, result: null }
    const current = data.presets[idx]
    const updated: Preset = {
      ...current,
      name: input.name !== undefined ? input.name : current.name,
      variables: input.variables !== undefined ? input.variables : current.variables,
      updatedAt: new Date().toISOString(),
    }
    const presets = [...data.presets]
    presets[idx] = updated
    return { next: { ...data, presets }, result: updated }
  })
}

/**
 * Delete a preset and archive a snapshot of it to history. The archive
 * happens AFTER the delete is committed so we don't end up with the
 * preset still in `presets` while a duplicate is also in `backups`.
 */
export async function deletePreset(id: string): Promise<boolean> {
  const archived = await mutateData(data => {
    const idx = data.presets.findIndex(p => p.id === id)
    if (idx === -1) return { next: null, result: null }
    const removed = data.presets[idx]
    const presets = [...data.presets]
    presets.splice(idx, 1)
    const next = {
      ...data,
      presets,
      activePresetId: data.activePresetId === id ? null : data.activePresetId,
      lastAppliedVariables: data.activePresetId === id ? [] : data.lastAppliedVariables,
    }
    return { next, result: removed }
  })
  if (!archived) return false
  await archivePreset(archived)
  return true
}

export function duplicatePreset(id: string): Promise<Preset | null> {
  return mutateData(data => {
    const source = data.presets.find(p => p.id === id)
    if (!source) return { next: null, result: null }
    const now = new Date().toISOString()
    const copy: Preset = {
      id: uuidv4(),
      name: `${source.name} (Copy)`,
      variables: source.variables.map(v => ({ ...v })),
      createdAt: now,
      updatedAt: now,
    }
    return { next: { ...data, presets: [...data.presets, copy] }, result: copy }
  })
}

export function getActivePresetId(): string | null {
  return readDataFile().activePresetId
}

export function getLastAppliedVariables(): string[] {
  return readDataFile().lastAppliedVariables ?? []
}

export function getActiveSnapshotBackupId(): string | null {
  return readDataFile().activeSnapshotBackupId ?? null
}

/**
 * Update the "currently active" pointer atomically. When `id` is null,
 * the snapshot id and applied keys are also cleared. When activating
 * a preset, callers should pass the freshly created pre-activation
 * backup id so deactivate can roll back accurately.
 */
export function setActivePresetId(
  id: string | null,
  variableKeys: string[] = [],
  snapshotBackupId: string | null = null,
): Promise<void> {
  return mutateData(data => {
    const next = {
      ...data,
      activePresetId: id,
      lastAppliedVariables: id !== null ? variableKeys : [],
      activeSnapshotBackupId: id !== null ? snapshotBackupId : null,
    }
    return { next, result: undefined as void }
  })
}
