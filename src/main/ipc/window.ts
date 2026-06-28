import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC } from '../../shared/constants'
import { ok, fail } from './helpers'

export function registerWindowHandlers(): void {
  ipcMain.handle(IPC.WINDOW.MINIMIZE, async (): Promise<import('../../shared/types').IpcResult<boolean>> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return fail('NO_WINDOW', 'No active window')
    win.minimize()
    return ok(true)
  })

  ipcMain.handle(IPC.WINDOW.MAXIMIZE_TOGGLE, async (): Promise<import('../../shared/types').IpcResult<boolean>> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return fail('NO_WINDOW', 'No active window')
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return ok(true)
  })

  ipcMain.handle(IPC.WINDOW.CLOSE, async (): Promise<import('../../shared/types').IpcResult<boolean>> => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return fail('NO_WINDOW', 'No active window')
    win.close()
    return ok(true)
  })

  ipcMain.handle(IPC.WINDOW.RELAUNCH, async (): Promise<import('../../shared/types').IpcResult<boolean>> => {
    app.relaunch()
    app.exit(0)
    return ok(true)
  })
}
