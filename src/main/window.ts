import { BrowserWindow, shell, app } from 'electron'
import * as path from 'path'
import { getSettings } from './storage/settings'

let mainWindow: BrowserWindow | null = null
let forceQuit = false

export function setForceQuit(value: boolean): void {
  forceQuit = value
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createWindow(showOnReady = true): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'EnvSnap - Environment Manager',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    if (showOnReady) {
      mainWindow!.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (forceQuit) return
    const settings = getSettings()
    if (settings.minimizeToTray) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export function showWindow(): void {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
}

export function hideWindow(): void {
  if (mainWindow) {
    mainWindow.hide()
  }
}
