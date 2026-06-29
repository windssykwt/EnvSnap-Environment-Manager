import { app, BrowserWindow } from 'electron'
import { createWindow, getMainWindow, setForceQuit } from './window'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'
import { logger } from './logger'
import { isStartupHiddenLaunch, syncLaunchOnStartupSetting } from './startup'
import { getSettings } from './storage/settings'
import { APP_NAME } from '../shared/constants'

app.setAppUserModelId(APP_NAME)

app.whenReady().then(() => {
  logger.info('Application starting', {
    execPath: process.execPath,
    exe: app.getPath('exe'),
    packaged: app.isPackaged,
    hiddenLaunch: isStartupHiddenLaunch(),
  })

  const settings = getSettings()

  registerIpcHandlers()
  createWindow(!isStartupHiddenLaunch())
  createTray()
  syncLaunchOnStartupSetting(settings.launchOnStartup)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      const win = getMainWindow()
      if (win) win.show()
    }
  })
}).catch(err => {
  logger.error('Failed to initialise application', { error: String(err) })
})

app.on('before-quit', () => {
  setForceQuit(true)
  logger.info('Application quitting')
})

app.on('window-all-closed', () => {

})

// Catch renderer crashes so we can log what went wrong
app.on('render-process-gone', (_event, _webContents, details) => {
  logger.error('Renderer process gone', {
    reason: details.reason,
    exitCode: details.exitCode,
  })
})

// Catch uncaught exceptions in the main process
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: String(err), stack: err.stack })
})
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: String(reason) })
})
