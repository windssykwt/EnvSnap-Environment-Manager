import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { DataFile, BackupsFile, Preset } from '../../shared/types'
import { DEFAULT_SETTINGS, APP_NAME } from '../../shared/constants'
import { logger } from '../logger'
import { AsyncMutex } from './lock'
import { isEncryptionAvailable, readFileWithDecryption, atomicEncryptedWrite } from './crypto'

const DATA_FILENAME = 'data.json'
const BACKUPS_FILENAME = 'backups.json'

// One mutex per logical file. All reads/writes go through these so
// concurrent IPC handlers cannot interleave a read-modify-write cycle.
const dataMutex = new AsyncMutex()
const backupsMutex = new AsyncMutex()

// In-memory caches. Initialised lazily on first read, then mutated under
// the mutex. The on-disk file is the source of truth; the cache only
// serves to avoid re-parsing on every call.
let dataCache: DataFile | null = null
let backupsCache: BackupsFile | null = null

// Resolved storage location. Resolved exactly once at startup so a
// later edit to data.json (e.g. the user moving the file by hand) does
// not silently fork the app between two locations mid-session.
let resolvedStorageLocation: string | null = null

function getDefaultStorageLocation(): string {
  return path.join(app.getPath('appData'), APP_NAME)
}

function resolveStorageLocation(): string {
  if (resolvedStorageLocation) return resolvedStorageLocation
  const defaultPath = path.join(getDefaultStorageLocation(), DATA_FILENAME)
  try {
    if (fs.existsSync(defaultPath)) {
      const result = readFileWithDecryption(defaultPath)
      if (result) {
        const data = JSON.parse(result.content) as DataFile
        if (data.settings?.storageLocation) {
          resolvedStorageLocation = data.settings.storageLocation
          return resolvedStorageLocation
        }
      }
    }
  } catch {
    // fall through to default
  }
  resolvedStorageLocation = getDefaultStorageLocation()
  return resolvedStorageLocation
}

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Atomic encrypted write. Delegates to the crypto module which handles
 * safeStorage (DPAPI on Windows) encryption and the same fsync+rename
 * durability pattern as before.
 *
 * Falls back to plain-text if encryption is unavailable (graceful
 * degradation — should not happen on Windows).
 */
async function atomicWriteAsync(filePath: string, data: string): Promise<void> {
  await atomicEncryptedWrite(filePath, data)
}

function getDefaultData(): DataFile {
  return {
    presets: [],
    activePresetId: null,
    lastAppliedVariables: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

/**
 * Ensure every preset has the fields expected by the current version.
 * Handles old data files that lack newly-added properties.
 */
function normalizePreset(p: Partial<Preset>): Preset {
  return {
    id: p.id ?? '',
    name: p.name ?? '',
    group: p.group ?? '',
    position: p.position ?? 0,
    isPinned: p.isPinned ?? false,
    variables: p.variables ?? [],
    createdAt: p.createdAt ?? '',
    updatedAt: p.updatedAt ?? '',
  }
}

function getDefaultBackups(): BackupsFile {
  return { backups: [] }
}

function loadDataFromDisk(): DataFile {
  const filePath = path.join(resolveStorageLocation(), DATA_FILENAME)
  try {
    ensureDirSync(resolveStorageLocation())
    const result = readFileWithDecryption(filePath)
    if (result) {
      const data = JSON.parse(result.content) as DataFile
      // Auto-migrate: if the file was plain-text and encryption is now
      // available, re-write it encrypted. This happens once on upgrade.
      if (!result.wasEncrypted && isEncryptionAvailable()) {
        logger.info('Migrating data.json to encrypted format')
        const merged = { ...getDefaultData(), ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } }
        atomicWriteAsync(filePath, JSON.stringify(merged, null, 2)).catch(err => {
          logger.error('Failed to migrate data.json to encrypted format', { error: String(err) })
        })
      }
      // Migrate legacy presets that lack the `position` field: assign
      // sequential positions within each group preserving file order.
      const rawPresets = data.presets ?? []
      const needsMigration = rawPresets.some(p => p.position === undefined || p.position === null)
      if (needsMigration) {
        const posMap = new Map<string, number>()
        data.presets = rawPresets.map(p => {
          if (p.position === undefined || p.position === null) {
            const g = p.group ?? ''
            const pos = (posMap.get(g) ?? -1) + 1
            posMap.set(g, pos)
            return { ...p, position: pos }
          }
          return p
        })
        // Write migrated data back immediately so the next load is clean
        atomicWriteAsync(filePath, JSON.stringify(data, null, 2)).catch(err => {
          logger.error('Failed to write migrated data.json', { error: String(err) })
        })
      }
      return { ...getDefaultData(), ...data, presets: (data.presets ?? []).map(normalizePreset), settings: { ...DEFAULT_SETTINGS, ...data.settings } }
    }
  } catch (err) {
    logger.error('Failed to read data file', { error: String(err) })
  }
  return getDefaultData()
}

function loadBackupsFromDisk(): BackupsFile {
  const filePath = path.join(resolveStorageLocation(), BACKUPS_FILENAME)
  try {
    ensureDirSync(resolveStorageLocation())
    const result = readFileWithDecryption(filePath)
    if (result) {
      const data = { ...getDefaultBackups(), ...JSON.parse(result.content) } as BackupsFile
      // Auto-migrate: if the file was plain-text and encryption is now
      // available, re-write it encrypted.
      if (!result.wasEncrypted && isEncryptionAvailable()) {
        logger.info('Migrating backups.json to encrypted format')
        atomicWriteAsync(filePath, JSON.stringify(data, null, 2)).catch(err => {
          logger.error('Failed to migrate backups.json to encrypted format', { error: String(err) })
        })
      }
      return data
    }
  } catch (err) {
    logger.error('Failed to read backups file', { error: String(err) })
  }
  return getDefaultBackups()
}

export function getDataPath(): string {
  return resolveStorageLocation()
}

/**
 * Synchronous read used by call sites that have already taken the
 * mutex (i.e. inside a `mutateData` callback). Don't call this from
 * outside the storage module. It bypasses the mutex on purpose.
 */
export function readDataFile(): DataFile {
  if (!dataCache) {
    dataCache = loadDataFromDisk()
  }
  // Return a shallow copy so accidental external mutations don't leak
  // into the cache. Inner objects (presets[], settings) are still
  // shared references — callers should produce new arrays/objects when
  // they mutate them, which the existing code already does.
  return {
    ...dataCache,
    presets: dataCache.presets.map(normalizePreset),
    settings: { ...dataCache.settings },
    lastAppliedVariables: dataCache.lastAppliedVariables ? [...dataCache.lastAppliedVariables] : [],
  }
}

export function readBackupsFile(): BackupsFile {
  if (!backupsCache) {
    backupsCache = loadBackupsFromDisk()
  }
  return { backups: [...backupsCache.backups] }
}

/**
 * Persist a complete new DataFile under the data mutex. Use
 * `mutateData` instead when you need read-modify-write atomicity.
 */
export function writeDataFile(data: DataFile): Promise<void> {
  return dataMutex.run(async () => {
    dataCache = data
    ensureDirSync(resolveStorageLocation())
    await atomicWriteAsync(
      path.join(resolveStorageLocation(), DATA_FILENAME),
      JSON.stringify(data, null, 2),
    )
  })
}

export function writeBackupsFile(data: BackupsFile): Promise<void> {
  return backupsMutex.run(async () => {
    backupsCache = data
    ensureDirSync(resolveStorageLocation())
    await atomicWriteAsync(
      path.join(resolveStorageLocation(), BACKUPS_FILENAME),
      JSON.stringify(data, null, 2),
    )
  })
}

/**
 * Run a read-modify-write cycle on data.json under the mutex. The
 * callback receives the current snapshot, returns the new state (or
 * `null` to skip the write) plus an optional return value forwarded to
 * the caller.
 */
export function mutateData<T>(
  fn: (current: DataFile) => { next: DataFile | null; result: T },
): Promise<T> {
  return dataMutex.run(async () => {
    if (!dataCache) {
      dataCache = loadDataFromDisk()
    }
    const snapshot: DataFile = {
      ...dataCache,
      presets: dataCache.presets.map(p => normalizePreset({ ...p, variables: p.variables.map(v => ({ ...v })) })),
      settings: { ...dataCache.settings },
      lastAppliedVariables: dataCache.lastAppliedVariables ? [...dataCache.lastAppliedVariables] : [],
    }
    const { next, result } = fn(snapshot)
    if (next) {
      dataCache = next
      ensureDirSync(resolveStorageLocation())
      await atomicWriteAsync(
        path.join(resolveStorageLocation(), DATA_FILENAME),
        JSON.stringify(next, null, 2),
      )
    }
    return result
  })
}

/** Same as `mutateData` but for backups.json. */
export function mutateBackups<T>(
  fn: (current: BackupsFile) => { next: BackupsFile | null; result: T },
): Promise<T> {
  return backupsMutex.run(async () => {
    if (!backupsCache) {
      backupsCache = loadBackupsFromDisk()
    }
    const snapshot: BackupsFile = { backups: [...backupsCache.backups] }
    const { next, result } = fn(snapshot)
    if (next) {
      backupsCache = next
      ensureDirSync(resolveStorageLocation())
      await atomicWriteAsync(
        path.join(resolveStorageLocation(), BACKUPS_FILENAME),
        JSON.stringify(next, null, 2),
      )
    }
    return result
  })
}
