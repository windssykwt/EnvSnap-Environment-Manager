import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { IpcResult } from '../../shared/types'
import { IPC } from '../../shared/constants'
import { validateDialogFilters } from '../validation'
import { ok, fail, bad } from './helpers'

export function registerDialogHandlers(): void {
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

  ipcMain.handle(IPC.DIALOG.OPEN_DIRECTORY, async (): Promise<IpcResult<string | null>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) return ok(null)
      return ok(result.filePaths[0])
    } catch (err) {
      return bad(err, 'DIALOG_FAILED', 'Failed to open directory dialog')
    }
  })
}
