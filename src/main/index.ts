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
  logger.info('Application starting')

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
})

app.on('before-quit', () => {
  setForceQuit(true)
  logger.info('Application quitting')
})

app.on('window-all-closed', () => {

})
