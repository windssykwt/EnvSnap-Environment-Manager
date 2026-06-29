import { ipcMain, app } from 'electron'
import * as path from 'path'
import type { IpcResult, Settings } from '../../shared/types'
import { IPC, APP_NAME } from '../../shared/constants'
import { logger } from '../logger'
import * as settingsStore from '../storage/settings'
import { moveStorageTo } from '../storage'
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

      // === Storage-location change: save first, then migrate ===
      // We save the new path to the current location first (so it's
      // durable), then copy data to the new path + update the pointer
      // file. Session singletons are left untouched — the running
      // session continues at its current location until restart.
      if (validated.storageLocation !== undefined && validated.storageLocation !== prev.storageLocation) {
        // 1. Write the new storageLocation to the CURRENT location's
        //    data.json (this is where the setting lives until restart).
        const updated = await settingsStore.updateSettings(validated as Partial<Settings>)

        // 2. Copy data to the new path and update the default pointer.
        const newDir = validated.storageLocation.trim()
        if (newDir) {
          await moveStorageTo(newDir, false)
        } else {
          const defaultDir = path.join(app.getPath('appData'), APP_NAME)
          await moveStorageTo(defaultDir, true)
        }

        // 3. Apply any non-storage settings from the same call that
        //    would not have been saved by step 1 (already handled).

        if (validated.launchOnStartup !== undefined && validated.launchOnStartup !== prev.launchOnStartup) {
          setLaunchOnStartup(updated.launchOnStartup)
        }
        logger.info('Storage location changed — data copied', {
          from: prev.storageLocation || '(default)',
          to: validated.storageLocation || '(default)',
        })
        return ok(updated)
      }

      // === Non-storage-location updates proceed as normal ===
      const updated = await settingsStore.updateSettings(validated as Partial<Settings>)

      if (validated.launchOnStartup !== undefined && validated.launchOnStartup !== prev.launchOnStartup) {
        setLaunchOnStartup(updated.launchOnStartup)
      }

      logger.info('Settings updated')
      return ok(updated)
    } catch (err) {
      logger.error('Failed to update settings', { error: String(err) })
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
