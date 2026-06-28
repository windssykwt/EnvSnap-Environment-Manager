import { ipcMain } from 'electron'
import type { IpcResult } from '../../shared/types'
import { IPC } from '../../shared/constants'
import { logger } from '../logger'
import { readAllUserEnvVars } from '../env'
import { ok, fail } from './helpers'

export function registerEnvHandlers(): void {
  ipcMain.handle(IPC.ENV.READ_ALL, async (): Promise<IpcResult<Record<string, string>>> => {
    try {
      const vars = await readAllUserEnvVars()
      return ok(vars)
    } catch (err) {
      logger.error('Failed to read env vars')
      return fail('READ_FAILED', 'Failed to read Windows environment variables')
    }
  })
}
