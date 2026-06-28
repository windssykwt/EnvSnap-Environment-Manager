import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import type { IpcResult, Preset, ProfileExport, AppConfigExport, DataFile, BackupsFile } from '../../shared/types'
import { IPC, DEFAULT_SETTINGS } from '../../shared/constants'
import { logger } from '../logger'
import * as presetStore from '../storage/presets'
import { readDataFile, writeDataFile, readBackupsFile, writeBackupsFile, mutateData } from '../storage'
import { rebuildTray } from '../tray'
import {
  validateId,
  validateIdArray,
  validateImportPresets,
  validateImportMergeVariables,
  validateConfigImport,
  validateProfileImport,
  readImportFileBounded,
} from '../validation'
import { ok, fail, bad } from './helpers'

export function registerImportExportHandlers(): void {
  // --- Preset Export (multi-select) ---
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

  // --- Single Preset Export ---
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

  // --- Merge Import into a Single Preset ---
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
      rebuildTray()
      logger.info('Preset merged from file', { id: presetId, added: String(added), updated: String(updated) })
      return ok({ added, updated })
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import variables. Please check the file format.')
    }
  })

  // --- Bulk Preset Import ---
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

      rebuildTray()
      logger.info('Presets imported', { count: String(imported), skipped: String(validated.skipped) })
      return ok({ imported, skipped: validated.skipped })
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import presets. Please check the file format.')
    }
  })

  // --- Import Peek (preview without importing) ---
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

  // --- Full Config Export ---
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

  // --- Full Config Import ---
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

      const idRemap = new Map<string, string>()
      const newPresets: Preset[] = []
      const now = new Date().toISOString()
      for (const p of validated.presets) {
        const newId = randomUUID()
        newPresets.push({
          id: newId,
          name: p.name,
          variables: p.variables,
          createdAt: now,
          updatedAt: now,
        })
      }

      let activePresetId: string | null = null
      void idRemap

      const data: DataFile = {
        presets: newPresets,
        activePresetId,
        lastAppliedVariables: [],
        settings: { ...DEFAULT_SETTINGS, ...validated.settings },
      }

      const backups: BackupsFile = {
        backups: validated.backups as BackupsFile['backups'],
      }

      await writeDataFile(data)
      await writeBackupsFile(backups)
      rebuildTray()
      logger.info('Config imported', { presets: String(newPresets.length) })
      return ok(true)
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import configuration. Please check the file format.')
    }
  })

  // --- Profile Export ---
  ipcMain.handle(IPC.PROFILE.EXPORT, async (_e, folderNames: string[]): Promise<IpcResult<boolean>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showSaveDialog(win!, {
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: `envsnap-profile-${new Date().toISOString().slice(0, 10)}.json`,
      })
      if (result.canceled || !result.filePath) return ok(false)

      const data = readDataFile()
      const exportData: ProfileExport = {
        version: 1,
        appName: 'EnvSnap',
        exportedAt: new Date().toISOString(),
        presets: data.presets,
        folderNames,
      }

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      logger.info('Profile exported')
      return ok(true)
    } catch (err) {
      logger.error('Failed to export profile', { error: String(err) })
      return fail('EXPORT_FAILED', 'Failed to export profile')
    }
  })

  // --- Profile Import ---
  ipcMain.handle(IPC.PROFILE.IMPORT, async (): Promise<IpcResult<{ folderNames: string[]; presetCount: number }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const dialogResult = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) return ok({ folderNames: [], presetCount: 0 })

      const filePath = dialogResult.filePaths[0]
      const raw = await readImportFileBounded(filePath)
      const parsed = JSON.parse(raw)
      const validated = validateProfileImport(parsed)

      const now = new Date().toISOString()
      const newPresets: Preset[] = []
      for (const p of validated.presets) {
        const id = randomUUID()
        newPresets.push({
          id,
          name: p.name,
          group: p.group ?? '',
          position: p.position ?? 0,
          isPinned: p.isPinned ?? false,
          variables: p.variables ?? [],
          createdAt: now,
          updatedAt: now,
        })
      }

      await mutateData(data => {
        const presets = [...data.presets, ...newPresets]
        return { next: { ...data, presets }, result: undefined as void }
      })

      logger.info('Profile imported', { presets: String(newPresets.length) })
      return ok({ folderNames: validated.folderNames, presetCount: newPresets.length })
    } catch (err) {
      if (err instanceof SyntaxError) {
        return fail('INVALID_FORMAT', 'Selected file is not valid JSON')
      }
      return bad(err, 'IMPORT_FAILED', 'Failed to import profile. Please check the file format.')
    }
  })
}
