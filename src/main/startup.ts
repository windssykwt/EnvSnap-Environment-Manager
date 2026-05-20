import { app } from 'electron'
import { logger } from './logger'

const STARTUP_HIDDEN_ARG = '--hidden'

function getStartupOptions(enabled: boolean): Electron.Settings {
  return {
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: [STARTUP_HIDDEN_ARG],
  }
}

export function isStartupHiddenLaunch(): boolean {
  return process.argv.includes(STARTUP_HIDDEN_ARG)
}

/**
 * Register or unregister the app to launch at Windows login.
 *
 * In a packaged build this points Windows at the installed exe, which
 * is stable. In dev mode the "exe" is the local copy of electron.exe
 * inside `node_modules`, which disappears as soon as you reinstall or
 * move the project, leaving a broken Run-key entry behind. We refuse
 * to register in dev for that reason and surface the choice clearly
 * in the log so the user knows their toggle was ignored.
 */
export function setLaunchOnStartup(enabled: boolean): void {
  if (!app.isPackaged) {
    logger.warn('Launch on startup is disabled in development builds', {
      requested: String(enabled),
    })
    // Best-effort: if a previous packaged install ever wrote a Run-key
    // entry pointing at this dev path, clear it so we don't leave the
    // user in a broken state.
    if (!enabled) {
      app.setLoginItemSettings({ openAtLogin: false })
    }
    return
  }
  app.setLoginItemSettings(getStartupOptions(enabled))
  logger.info('Launch on startup updated', { enabled: String(enabled) })
}

/**
 * Reconcile Windows' current login item state with the user's saved
 * preference. No-ops in dev so we don't keep "fixing" a setting that
 * we deliberately don't honour outside packaged builds.
 */
export function syncLaunchOnStartupSetting(enabled: boolean): void {
  if (!app.isPackaged) return
  const current = app.getLoginItemSettings(getStartupOptions(enabled))
  if (current.openAtLogin !== enabled) {
    setLaunchOnStartup(enabled)
  }
}
