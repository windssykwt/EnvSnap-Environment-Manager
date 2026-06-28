import { ipcMain, app } from 'electron'
import * as path from 'path'
import type { IpcResult, Settings } from '../../shared/types'
import { IPC, APP_NAME } from '../../shared/constants'
import { logger } from '../logger'
import * as settingsStore from '../storage/settings'
import { setLaunchOnStartup } from '../startup'
import { validateSettingsPartial } from '../validation'
import { ok, fail, bad } from './helpers'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS.GET, async (): Promise<IpcResult<Settings>> => {
    try {
      return ok(settingsStore.getSettings())
    } catch (err) {
      return fail('GET_FAILED', 'Failed to load settings')
    }
  })

  ipcMain.handle(IPC.SETTINGS.UPDATE, async (_e, partial: unknown): Promise<IpcResult<Settings>> => {
    try {
      const validated = validateSettingsPartial(partial)
      const prev = settingsStore.getSettings()
      const updated = await settingsStore.updateSettings(validated as Partial<Settings>)

      if (validated.launchOnStartup !== undefined && validated.launchOnStartup !== prev.launchOnStartup) {
        setLaunchOnStartup(updated.launchOnStartup)
      }

      logger.info('Settings updated')
      return ok(updated)
    } catch (err) {
      return bad(err, 'UPDATE_FAILED', 'Failed to update settings')
    }
  })

  ipcMain.handle(IPC.SETTINGS.GET_DEFAULT_PATH, async (): Promise<IpcResult<string>> => {
    try {
      return ok(path.join(app.getPath('appData'), APP_NAME))
    } catch (err) {
      return fail('GET_DEFAULT_PATH_FAILED', 'Failed to get default storage path')
    }
  })
}
