import { execFile } from 'child_process'
import { logger } from '../logger'
import { ENV_KEY_REGEX } from '../../shared/constants'

export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_REGEX.test(key)
}

export function escapePS(str: string): string {
  // In single-quoted PowerShell strings, only ' needs escaping (doubled)
  return str.replace(/'/g, "''")
}

export async function setUserEnvVar(key: string, value: string): Promise<void> {
  if (!isValidEnvKey(key)) {
    throw new Error(`Invalid environment variable key: ${key}`)
  }

  const script = `$ErrorActionPreference = 'Stop'\n[Environment]::SetEnvironmentVariable('${escapePS(key)}', '${escapePS(value)}', 'User')`

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 }, (err, _stdout, stderr) => {
      if (err) {
        logger.error('Failed to set env var', { key })
        reject(err)
        return
      }
      if (stderr && stderr.trim()) {
        logger.error('PowerShell error setting env var', { key })
        reject(new Error(stderr.trim()))
        return
      }
      resolve()
    })
  })
}

export async function deleteUserEnvVar(key: string): Promise<void> {
  if (!isValidEnvKey(key)) {
    throw new Error(`Invalid environment variable key: ${key}`)
  }

  const script = `$ErrorActionPreference = 'Stop'\n[Environment]::SetEnvironmentVariable('${escapePS(key)}', [NullString]::Value, 'User')`

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 }, (err, _stdout, stderr) => {
      if (err) {
        logger.error('Failed to delete env var', { key })
        reject(err)
        return
      }
      if (stderr && stderr.trim()) {
        reject(new Error(stderr.trim()))
        return
      }
      resolve()
    })
  })
}

/**
 * @deprecated Use the driver-based `applyPresetVariables` from `./apply.ts` instead.
 * This function is kept for reference but no longer exported from the barrel.
 */
async function _legacyApplyPresetVariables(
  variables: Array<{ key: string; value: string }>,
  keysToDelete: string[] = []
): Promise<{
  appliedCount: number
  failedVariables: Array<{ key: string; reason: string }>
}> {
  void variables
  void keysToDelete
  throw new Error('Legacy path removed. Use apply.ts driver-based implementation.')
}
