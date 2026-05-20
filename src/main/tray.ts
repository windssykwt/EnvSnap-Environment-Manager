import { Tray, Menu, nativeImage, Notification, app, BrowserWindow } from 'electron'
import * as path from 'path'
import { logger } from './logger'
import * as presetStore from './storage/presets'
import { activatePresetDirect } from './activation'
import { getSettings } from './storage/settings'

let tray: Tray | null = null

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico')
  }
  return path.join(app.getAppPath(), 'resources', 'icon.ico')
}

export function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath())
  const iconSize = icon.getSize()
  const resizedIcon = iconSize.width > 0 ? icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty()
  tray = new Tray(resizedIcon.getSize().width > 0 ? resizedIcon : icon)
  tray.setToolTip('EnvSnap')
  buildTrayMenu()
}

export function buildTrayMenu(): void {
  if (!tray) return

  const presets = presetStore.listPresets()
  const activeId = presetStore.getActivePresetId()
  const settings = getSettings()

  const presetMenuItems = presets.map(p => ({
    label: p.name + (p.id === activeId ? ' ✓' : ''),
    type: 'normal' as const,
    click: async () => {
      const result = await activatePresetDirect(p)
      if (result.success) {
        buildTrayMenu()
        const allWindows = BrowserWindow.getAllWindows()
        for (const win of allWindows) {
          win.webContents.send('preset:activated', p.id)
        }
        if (settings.showNotification) {
          new Notification({ title: 'EnvSnap', body: `Preset "${p.name}" activated` }).show()
        }
      } else {
        new Notification({ title: 'EnvSnap', body: result.error ?? 'Activation failed' }).show()
      }
    },
  }))

  const activeName = presets.find(p => p.id === activeId)?.name ?? 'None'

  const contextMenu = Menu.buildFromTemplate([
    { label: 'EnvSnap', enabled: false },
    { type: 'separator' },
    { label: `Active: ${activeId ? activeName : 'None'}`, enabled: false },
    { type: 'separator' },
    { label: 'Switch Preset', submenu: presetMenuItems.length > 0 ? presetMenuItems : [{ label: 'No presets', enabled: false }] },
    { type: 'separator' },
    { label: 'Open App', click: () => { showWindow() } },
    { label: 'Refresh', click: () => { buildTrayMenu() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.exit(0) } },
  ])

  tray.setContextMenu(contextMenu)
}

function showWindow(): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    wins[0].show()
    wins[0].focus()
  }
}
