import type { Variable, CreatePresetInput, UpdatePresetInput } from '../shared/types'
import { ENV_KEY_REGEX } from '../shared/constants'

/**
 * Caps. These are deliberately generous for normal use but keep a
 * malicious or corrupted file from blowing up memory or the JSON
 * writer. Numbers chosen to be well above realistic single-developer
 * use and well below "dangerous".
 */
export const LIMITS = {
  PRESET_NAME_MAX: 100,
  VARIABLE_KEY_MAX: 255,
  /** 32 KB per value; Windows itself can store much more but ENVChanger
   *  is a UI tool, not a vault. */
  VARIABLE_VALUE_MAX: 32 * 1024,
  VARIABLES_PER_PRESET_MAX: 1000,
  PRESETS_TOTAL_MAX: 1000,
  /** 10 MB cap on raw import file size before we even parse JSON. */
  IMPORT_FILE_BYTES_MAX: 10 * 1024 * 1024,
}

/**
 * Disallowed property keys when ingesting external JSON. Plain JSON
 * parsing produces null-prototype-free objects but the values still go
 * through `{ ...spread }` in storage code, so we strip these names to
 * keep that defensive.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export class ValidationError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  if (value.length > max) return null
  return value
}

function validateVariableArray(input: unknown, context: string): Variable[] {
  if (!Array.isArray(input)) {
    throw new ValidationError('INVALID_INPUT', `${context}: variables must be an array`)
  }
  if (input.length > LIMITS.VARIABLES_PER_PRESET_MAX) {
    throw new ValidationError('INVALID_INPUT', `${context}: too many variables (max ${LIMITS.VARIABLES_PER_PRESET_MAX})`)
  }
  const out: Variable[] = []
  for (let i = 0; i < input.length; i++) {
    const v = input[i]
    if (!isPlainObject(v)) {
      throw new ValidationError('INVALID_INPUT', `${context}: variable at index ${i} must be an object`)
    }
    const key = sanitizeString((v as any).key, LIMITS.VARIABLE_KEY_MAX)
    if (key === null) {
      throw new ValidationError('INVALID_INPUT', `${context}: variable at index ${i} has an invalid key`)
    }
    // Empty keys are tolerated for in-progress edits, but anything that
    // *is* set must be a legal Windows env var name.
    if (key !== '' && !ENV_KEY_REGEX.test(key)) {
      throw new ValidationError('INVALID_INPUT', `${context}: variable at index ${i} has an invalid key name`)
    }
    const value = sanitizeString((v as any).value, LIMITS.VARIABLE_VALUE_MAX)
    if (value === null) {
      throw new ValidationError('INVALID_INPUT', `${context}: variable at index ${i} has an invalid value`)
    }
    out.push({ key, value })
  }
  return out
}

export function validateCreatePresetInput(input: unknown): CreatePresetInput {
  if (!isPlainObject(input)) {
    throw new ValidationError('INVALID_INPUT', 'Create input must be an object')
  }
  const name = sanitizeString(input.name, LIMITS.PRESET_NAME_MAX)
  if (name === null || name.trim() === '') {
    throw new ValidationError('INVALID_INPUT', 'Preset name is required')
  }
  const variables = input.variables === undefined
    ? []
    : validateVariableArray(input.variables, 'create')
  return { name, variables }
}

export function validateUpdatePresetInput(input: unknown): UpdatePresetInput {
  if (!isPlainObject(input)) {
    throw new ValidationError('INVALID_INPUT', 'Update input must be an object')
  }
  const out: UpdatePresetInput = {}
  if (input.name !== undefined) {
    const name = sanitizeString(input.name, LIMITS.PRESET_NAME_MAX)
    if (name === null || name.trim() === '') {
      throw new ValidationError('INVALID_INPUT', 'Preset name is required')
    }
    out.name = name
  }
  if (input.variables !== undefined) {
    out.variables = validateVariableArray(input.variables, 'update')
  }
  return out
}

export interface ValidatedImportPreset {
  name: string
  variables: Variable[]
}

export interface ImportPresetsResult {
  presets: ValidatedImportPreset[]
  /** Number of presets in the file we skipped because they failed
   *  validation. Surfaced to the user so they know it was lossy. */
  skipped: number
}

/**
 * Validate a parsed presets-import payload. Drops malformed presets
 * silently (returns count via `skipped`) but rejects entirely if the
 * top-level shape is wrong.
 */
export function validateImportPresets(parsed: unknown): ImportPresetsResult {
  if (!isPlainObject(parsed)) {
    throw new ValidationError('INVALID_FORMAT', 'Import file must be a JSON object')
  }
  const list = parsed.presets
  if (!Array.isArray(list)) {
    throw new ValidationError('INVALID_FORMAT', 'Import file must contain a "presets" array')
  }
  if (list.length > LIMITS.PRESETS_TOTAL_MAX) {
    throw new ValidationError('INVALID_FORMAT', `Too many presets in file (max ${LIMITS.PRESETS_TOTAL_MAX})`)
  }
  const out: ValidatedImportPreset[] = []
  let skipped = 0
  for (const p of list) {
    if (!isPlainObject(p)) {
      skipped++
      continue
    }
    const name = sanitizeString(p.name, LIMITS.PRESET_NAME_MAX)
    if (name === null || name.trim() === '') {
      skipped++
      continue
    }
    if (!Array.isArray(p.variables)) {
      skipped++
      continue
    }
    try {
      const vars = validateVariableArray(p.variables, `preset "${name}"`)
      out.push({ name, variables: vars })
    } catch {
      skipped++
    }
  }
  return { presets: out, skipped }
}

/**
 * Validate a parsed merge-import payload that targets a single preset.
 * Accepts an exported presets file, or a plain `{ variables: [...] }`,
 * or a bare variable array.
 */
export function validateImportMergeVariables(parsed: unknown): Variable[] {
  // Bare array form
  if (Array.isArray(parsed)) {
    return validateVariableArray(parsed, 'merge')
  }
  if (!isPlainObject(parsed)) {
    throw new ValidationError('INVALID_FORMAT', 'File must contain "presets" or "variables".')
  }
  if (Array.isArray(parsed.presets) && parsed.presets.length > 0) {
    const collected: Variable[] = []
    for (const p of parsed.presets) {
      if (!isPlainObject(p)) continue
      if (!Array.isArray(p.variables)) continue
      try {
        const vars = validateVariableArray(p.variables, 'merge.preset')
        for (const v of vars) collected.push(v)
        if (collected.length > LIMITS.VARIABLES_PER_PRESET_MAX) {
          throw new ValidationError('INVALID_INPUT', `Too many variables in file (max ${LIMITS.VARIABLES_PER_PRESET_MAX})`)
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err
      }
    }
    return collected
  }
  if (Array.isArray(parsed.variables)) {
    return validateVariableArray(parsed.variables, 'merge')
  }
  throw new ValidationError('INVALID_FORMAT', 'File must contain "presets" or "variables".')
}

/**
 * Validate a config-export file shape. Returns sanitized
 * `{ data, backups }` ready to write. Non-essential or unknown fields
 * are stripped.
 */
export function validateConfigImport(parsed: unknown): {
  presets: ValidatedImportPreset[]
  activePresetId: string | null
  lastAppliedVariables: string[]
  settings: Record<string, unknown>
  backups: unknown[]
} {
  if (!isPlainObject(parsed)) {
    throw new ValidationError('INVALID_FORMAT', 'Config file must be a JSON object')
  }
  const dataSection = parsed.data
  const backupsSection = parsed.backups
  if (!isPlainObject(dataSection) || !isPlainObject(backupsSection)) {
    throw new ValidationError('INVALID_FORMAT', 'Config file must include "data" and "backups" sections')
  }

  const presetsRaw = dataSection.presets
  const presetsList: ValidatedImportPreset[] = []
  if (Array.isArray(presetsRaw)) {
    if (presetsRaw.length > LIMITS.PRESETS_TOTAL_MAX) {
      throw new ValidationError('INVALID_FORMAT', 'Too many presets in config file')
    }
    for (const p of presetsRaw) {
      if (!isPlainObject(p)) continue
      const name = sanitizeString(p.name, LIMITS.PRESET_NAME_MAX)
      if (name === null || name.trim() === '') continue
      if (!Array.isArray(p.variables)) continue
      try {
        const vars = validateVariableArray(p.variables, `preset "${name}"`)
        presetsList.push({ name, variables: vars })
      } catch {
        // skip malformed preset rather than rejecting the whole import
      }
    }
  }

  const activePresetId =
    typeof dataSection.activePresetId === 'string' ? dataSection.activePresetId : null
  const lastAppliedVariables = Array.isArray(dataSection.lastAppliedVariables)
    ? dataSection.lastAppliedVariables.filter(
        (k): k is string => typeof k === 'string' && k.length <= LIMITS.VARIABLE_KEY_MAX,
      )
    : []

  const settingsIn = isPlainObject(dataSection.settings) ? dataSection.settings : {}
  const settings: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settingsIn)) {
    if (FORBIDDEN_KEYS.has(k)) continue
    settings[k] = v
  }

  const backupsArr = Array.isArray(backupsSection.backups) ? backupsSection.backups : []

  return {
    presets: presetsList,
    activePresetId,
    lastAppliedVariables,
    settings,
    backups: backupsArr,
  }
}

/** Reject ID parameters that don't look like opaque uuids. */
export function validateId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new ValidationError('INVALID_INPUT', 'Invalid id')
  }
  return id
}

/** Validate that a string array of ids contains only well-formed ids. */
export function validateIdArray(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    throw new ValidationError('INVALID_INPUT', 'Expected an array of ids')
  }
  return ids.map(validateId)
}

/** Validate Settings update payload. Only known boolean keys are kept. */
export function validateSettingsPartial(partial: unknown): Record<string, unknown> {
  if (!isPlainObject(partial)) {
    throw new ValidationError('INVALID_INPUT', 'Settings update must be an object')
  }
  const out: Record<string, unknown> = {}
  const booleanKeys = ['launchOnStartup', 'minimizeToTray', 'showNotification', 'confirmBeforeApply']
  for (const k of booleanKeys) {
    if (partial[k] !== undefined) {
      if (typeof partial[k] !== 'boolean') {
        throw new ValidationError('INVALID_INPUT', `Setting "${k}" must be a boolean`)
      }
      out[k] = partial[k]
    }
  }
  if (partial.storageLocation !== undefined) {
    if (typeof partial.storageLocation !== 'string' || partial.storageLocation.length > 1024) {
      throw new ValidationError('INVALID_INPUT', 'Setting "storageLocation" must be a string')
    }
    out.storageLocation = partial.storageLocation
  }
  if (partial.theme !== undefined) {
    if (partial.theme !== 'light' && partial.theme !== 'dark' && partial.theme !== 'system') {
      throw new ValidationError('INVALID_INPUT', 'Setting "theme" must be "light", "dark", or "system"')
    }
    out.theme = partial.theme
  }
  return out
}

export function validateDialogFilters(opts: unknown):
  | { filters?: Array<{ name: string; extensions: string[] }>; defaultPath?: string }
  | undefined {
  if (opts === undefined || opts === null) return undefined
  if (!isPlainObject(opts)) {
    throw new ValidationError('INVALID_INPUT', 'Dialog options must be an object')
  }
  const out: { filters?: Array<{ name: string; extensions: string[] }>; defaultPath?: string } = {}
  if (opts.filters !== undefined) {
    if (!Array.isArray(opts.filters)) {
      throw new ValidationError('INVALID_INPUT', 'Dialog filters must be an array')
    }
    const filters: Array<{ name: string; extensions: string[] }> = []
    for (const f of opts.filters) {
      if (!isPlainObject(f)) continue
      const name = sanitizeString(f.name, 100)
      if (name === null) continue
      if (!Array.isArray(f.extensions)) continue
      const exts = f.extensions.filter((e: unknown): e is string => typeof e === 'string' && e.length <= 32)
      filters.push({ name, extensions: exts })
    }
    out.filters = filters
  }
  if (opts.defaultPath !== undefined) {
    const dp = sanitizeString(opts.defaultPath, 1024)
    if (dp === null) {
      throw new ValidationError('INVALID_INPUT', 'Dialog defaultPath must be a string')
    }
    out.defaultPath = dp
  }
  return out
}

/**
 * Read a JSON import file with a hard size cap to prevent OOM. Throws
 * `ValidationError('FILE_TOO_LARGE')` when over the limit.
 */
export async function readImportFileBounded(filePath: string): Promise<string> {
  const fsp = await import('fs/promises')
  const stat = await fsp.stat(filePath)
  if (stat.size > LIMITS.IMPORT_FILE_BYTES_MAX) {
    throw new ValidationError(
      'FILE_TOO_LARGE',
      `Import file is too large (max ${LIMITS.IMPORT_FILE_BYTES_MAX} bytes)`,
    )
  }
  return fsp.readFile(filePath, 'utf-8')
}
