import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'
import type { DataFile, BackupsFile } from '../../shared/types'
import { DEFAULT_SETTINGS, APP_NAME } from '../../shared/constants'
import { logger } from '../logger'
import { AsyncMutex } from './lock'

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
      const raw = fs.readFileSync(defaultPath, 'utf-8')
      const data = JSON.parse(raw) as DataFile
      if (data.settings?.storageLocation) {
        resolvedStorageLocation = data.settings.storageLocation
        return resolvedStorageLocation
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
 * Atomic write that actually fsyncs. Order is:
 *   1. open tmp file
 *   2. write payload
 *   3. fsync the tmp file's data to disk
 *   4. rename tmp -> target (atomic on the same volume)
 *   5. fsync the parent directory so the rename itself is durable
 *
 * Without (3) and (5) a power loss right after rename can leave the
 * target file present but empty.
 */
async function atomicWriteAsync(filePath: string, data: string): Promise<void> {
  const tmpPath = filePath + '.tmp'
  const fh = await fsp.open(tmpPath, 'w')
  try {
    await fh.writeFile(data, 'utf-8')
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fsp.rename(tmpPath, filePath)

  // Best-effort dir fsync. Not supported on Windows for directories
  // (open will fail with EISDIR) so swallow that specific error.
  try {
    const dirHandle = await fsp.open(path.dirname(filePath), 'r')
    try {
      await dirHandle.sync()
    } finally {
      await dirHandle.close()
    }
  } catch {
    // ignore
  }
}

function getDefaultData(): DataFile {
  return {
    presets: [],
    activePresetId: null,
    lastAppliedVariables: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

function getDefaultBackups(): BackupsFile {
  return { backups: [] }
}

function loadDataFromDisk(): DataFile {
  const filePath = path.join(resolveStorageLocation(), DATA_FILENAME)
  try {
    ensureDirSync(resolveStorageLocation())
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw) as DataFile
      return { ...getDefaultData(), ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } }
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
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return { ...getDefaultBackups(), ...JSON.parse(raw) } as BackupsFile
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
    presets: [...dataCache.presets],
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
      presets: dataCache.presets.map(p => ({ ...p, variables: p.variables.map(v => ({ ...v })) })),
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
