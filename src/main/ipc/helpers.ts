import type { IpcResult } from '../../shared/types'
import { ValidationError } from '../validation'
import { logger } from '../logger'

export function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

export function fail(code: string, message: string, details?: string): IpcResult<never> {
  return { success: false, error: { code, message, details } }
}

/**
 * Wrap a handler error so that ValidationError is mapped to a clean IPC fail
 * response and any unexpected thrown error is logged but not leaked
 * verbatim to the renderer.
 */
export function bad(err: unknown, fallbackCode: string, fallbackMessage: string): IpcResult<never> {
  if (err instanceof ValidationError) {
    return fail(err.code, err.message)
  }
  logger.error(fallbackMessage, { error: String(err) })
  return fail(fallbackCode, fallbackMessage)
}
