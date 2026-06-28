import { Tray, Menu, nativeImage, Notification, app, BrowserWindow } from 'electron'
import * as path from 'path'
import { logger } from './logger'
import * as presetStore from './storage/presets'
import { activatePresetDirect } from './activation'
import { getSettings } from './storage/settings'

let tray: Tray | null = null

// ── Icon ────────────────────────────────────────────────────────────

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico')
  }
  return path.join(app.getAppPath(), 'resources', 'icon.ico')
}

/**
 * Create a small 16×16 tray icon overlay to indicate active state.
 * A green dot at the bottom-right when a preset is active; grey when inactive.
 */
function createTrayImage(active: boolean): nativeImage {
  const icon = nativeImage.createFromPath(getIconPath())
  const base = icon.getSize().width > 0 ? icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty()

  if (base.isEmpty()) {
    // Fallback: draw a minimal coloured square
    const size = 16
    const buf = Buffer.alloc(size * size * 4, 0)
    const colour = active ? [79, 183, 126, 255] : [140, 140, 140, 180]
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        buf[i] = colour[0]
        buf[i + 1] = colour[1]
        buf[i + 2] = colour[2]
        buf[i + 3] = colour[3]
      }
    }
    return nativeImage.createFromBuffer(buf, { width: size, height: size })
  }

  // If the icon loaded, overlay a small status dot on the bottom-right
  // by painting directly on the raw pixel buffer.
  const raw = base.toBitmap()
  const stride = 16 * 4 // 16px * 4 bytes (BGRA)
  const dotColour = active
    ? [79, 183, 126, 255]    // green
    : [180, 180, 180, 160]   // grey semi-transparent

  // 4×4 dot at bottom-right corner (px 12–15, row 12–15)
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      const i = ((12 + dy) * stride) + ((12 + dx) * 4)
      // Only draw if within buffer bounds
      if (i + 3 < raw.length) {
        raw[i] = dotColour[0]      // B
        raw[i + 1] = dotColour[1]  // G
        raw[i + 2] = dotColour[2]  // R
        raw[i + 3] = dotColour[3]  // A
      }
    }
  }

  return nativeImage.createFromBitmap(raw, { width: 16, height: 16 })
}

// ── Tray lifecycle ──────────────────────────────────────────────────

export function createTray(): void {
  const activeId = presetStore.getActivePresetId()
  const image = createTrayImage(!!activeId)
  tray = new Tray(image)
  tray.setToolTip('EnvSnap — Environment Manager')
  tray.on('double-click', () => showWindow())
  buildTrayMenu()
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

export function rebuildTray(): void {
  if (!tray) return
  const activeId = presetStore.getActivePresetId()
  tray.setImage(createTrayImage(!!activeId))
  buildTrayMenu()
}

// ── Context menu ────────────────────────────────────────────────────

export function buildTrayMenu(): void {
  if (!tray) return

  const presets = presetStore.listPresets()
  const activeId = presetStore.getActivePresetId()
  const settings = getSettings()

  /** Activate a preset and rebuild the tray + notify the renderer. */
  const doActivate = async (p: typeof presets[number]) => {
    const result = await activatePresetDirect(p)
    if (result.success) {
      rebuildTray()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('preset:activated', p.id)
      }
      if (settings.showNotification) {
        new Notification({ title: 'Notification', body: `Preset "${p.name}" activated` }).show()
      }
    } else {
      new Notification({ title: 'Notification', body: result.error ?? 'Activation failed' }).show()
    }
  }

  // Build the preset list: active preset first with a green dot, then the rest
  const activePreset = presets.find(p => p.id === activeId)
  const otherPresets = activePreset ? presets.filter(p => p.id !== activeId) : presets

  const menuItems: Electron.MenuItemConstructorOptions[] = []

  // ── Header ──────────────────────────────────────────────────────────
  menuItems.push({
    label: activeId && activePreset
      ? `● ${activePreset.name}`
      : 'No active preset',
    enabled: false,
  })
  menuItems.push({ type: 'separator' })

  // ── Preset quick-switch ─────────────────────────────────────────────
  if (activePreset) {
    menuItems.push({
      label: `  ${activePreset.name}`,
      icon: createSmallDot(false),
      click: () => {},  // already active, no-op
    })
  }
  for (const p of otherPresets) {
    menuItems.push({
      label: p.name,
      click: () => { void doActivate(p) },
    })
  }

  if (presets.length === 0) {
    menuItems.push({ label: 'No presets yet', enabled: false })
  }

  menuItems.push({ type: 'separator' })

  // ── Actions ─────────────────────────────────────────────────────────
  menuItems.push({
    label: 'Open App',
    click: () => showWindow(),
  })
  menuItems.push({
    label: 'Hide',
    click: () => hideWindow(),
  })
  menuItems.push({ type: 'separator' })
  menuItems.push({
    label: 'Quit EnvSnap',
    click: () => { app.exit(0) },
  })

  tray.setContextMenu(Menu.buildFromTemplate(menuItems))
}

/** Create a tiny 8×8 coloured dot used as a marker icon in the menu. */
function createSmallDot(active: boolean): nativeImage {
  const size = 8
  const buf = Buffer.alloc(size * size * 4, 0)
  const colour = active ? [79, 183, 126, 255] : [140, 140, 140, 100]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      buf[i] = colour[0]
      buf[i + 1] = colour[1]
      buf[i + 2] = colour[2]
      buf[i + 3] = colour[3]
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

// ── Window helpers ──────────────────────────────────────────────────

function showWindow(): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    wins[0].show()
    wins[0].focus()
  }
}

function hideWindow(): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    wins[0].hide()
  }
}
