import { app } from 'electron'
import { logger } from './logger'

const STARTUP_HIDDEN_ARG = '--hidden'

export function isStartupHiddenLaunch(): boolean {
  return process.argv.includes(STARTUP_HIDDEN_ARG)
}

/**
 * Register or unregister the app to launch at Windows login.
 *
 * Uses Electron's setLoginItemSettings which writes to the Windows
 * Registry Run key (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).
 *
 * For portable builds, this points at wherever the exe currently lives.
 * If the user moves the exe, they'll need to toggle the setting again.
 */
export function setLaunchOnStartup(enabled: boolean): void {
  if (!app.isPackaged) {
    logger.warn('Launch on startup is disabled in development builds', {
      requested: String(enabled),
    })
    if (!enabled) {
      app.setLoginItemSettings({ openAtLogin: false })
    }
    return
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.getPath('exe'),
      args: enabled ? [STARTUP_HIDDEN_ARG] : [],
    })
    logger.info('Launch on startup updated', { enabled: String(enabled), path: app.getPath('exe') })
  } catch (err) {
    logger.error('Failed to set launch on startup', { error: String(err) })
  }
}

/**
 * Reconcile Windows' current login item state with the user's saved
 * preference. No-ops in dev.
 */
export function syncLaunchOnStartupSetting(enabled: boolean): void {
  if (!app.isPackaged) return
  try {
    const current = app.getLoginItemSettings({ path: app.getPath('exe') })
    if (current.openAtLogin !== enabled) {
      setLaunchOnStartup(enabled)
    }
  } catch (err) {
    logger.error('Failed to sync launch on startup setting', { error: String(err) })
  }
}
