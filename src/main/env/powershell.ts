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

export async function applyPresetVariables(
  variables: Array<{ key: string; value: string }>,
  keysToDelete: string[] = []
): Promise<{
  appliedCount: number
  failedVariables: Array<{ key: string; reason: string }>
}> {
  // Validate all keys first
  const invalid = variables.filter(v => !isValidEnvKey(v.key))
  if (invalid.length > 0) {
    return {
      appliedCount: 0,
      failedVariables: invalid.map(v => ({ key: v.key, reason: 'Invalid key name' })),
    }
  }

  // Batch all writes into a single PowerShell invocation for performance.
  // $ErrorActionPreference = 'Stop' ensures any error terminates the script
  // and surfaces through the exit code rather than silently continuing.
  const lines: string[] = ['$ErrorActionPreference = \'Stop\'']

  for (const v of variables) {
    lines.push(`[Environment]::SetEnvironmentVariable('${escapePS(v.key)}', '${escapePS(v.value)}', 'User')`)
  }

  for (const key of keysToDelete) {
    if (isValidEnvKey(key)) {
      lines.push(`[Environment]::SetEnvironmentVariable('${escapePS(key)}', [NullString]::Value, 'User')`)
    }
  }

  // Nothing to do
  if (lines.length === 1) {
    return { appliedCount: 0, failedVariables: [] }
  }

  const script = lines.join('\n')

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 30000 },
      (err, _stdout, stderr) => {
        if (err) {
          const reason = stderr?.trim() || err.message
          logger.error('Failed to apply preset variables', { reason: reason.substring(0, 200) })
          resolve({
            appliedCount: 0,
            failedVariables: variables.map(v => ({ key: v.key, reason: reason.substring(0, 200) })),
          })
          return
        }
        // With $ErrorActionPreference = 'Stop', a non-zero exit also lands in err above.
        // Any remaining stderr here is a warning — log it but treat as success.
        if (stderr && stderr.trim()) {
          logger.warn('PowerShell warning applying preset', { stderr: stderr.trim().substring(0, 200) })
        }
        resolve({
          appliedCount: variables.length,
          failedVariables: [],
        })
      }
    )
  })
}
