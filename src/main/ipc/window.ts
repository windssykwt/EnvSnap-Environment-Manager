import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn } from 'child_process'
import { IPC } from '../../shared/constants'
import { logger } from '../logger'
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
    try {
      // Use direct spawn instead of app.relaunch() for broader Windows
      // compatibility (IoT LTSC may restrict Electron's internal mechanism).
      // Filter out --hidden so manual restarts always show the window.
      const cleanArgs = process.argv.slice(1).filter(a => a !== '--hidden')
      const child = spawn(process.execPath, cleanArgs, {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      logger.info('New instance spawned, exiting current process', {
        exe: process.execPath,
        args: cleanArgs,
        pid: child.pid,
      })
      // Brief delay so the child process has time to initialise its
      // process table entry before the parent exits completely.
      await new Promise(r => setTimeout(r, 300))
      app.exit(0)
      return ok(true)
    } catch (err) {
      logger.error('Relaunch failed — user must restart manually', { error: String(err) })
      return fail('RELAUNCH_FAILED', 'Auto-restart failed. Please close and reopen EnvSnap manually.')
    }
  })
}
