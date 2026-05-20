import { execFile } from 'child_process'
import { logger } from '../logger'
import { escapePS } from './powershell'
import type { SnapshotEntry } from '../../shared/types'

/**
 * Read all User Environment Variables via PowerShell.
 * Using [Environment]::GetEnvironmentVariables('User') is locale-independent
 * and handles REG_EXPAND_SZ, multi-line values, and Unicode correctly.
 */
export async function readAllUserEnvVars(): Promise<Record<string, string>> {
  const script = `
$ErrorActionPreference = 'Stop'
$vars = [Environment]::GetEnvironmentVariables('User')
$out = @{}
foreach ($key in $vars.Keys) { $out[$key] = [string]$vars[$key] }
Write-Output ($out | ConvertTo-Json -Compress)
`.trim()

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000 },
      (err, stdout) => {
        if (err) {
          logger.error('Failed to read User Environment Variables', { error: String(err) })
          reject(err)
          return
        }

        const trimmed = stdout.trim()
        if (!trimmed) {
          resolve({})
          return
        }

        try {
          const parsed = JSON.parse(trimmed)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            resolve({})
            return
          }
          const out: Record<string, string> = {}
          for (const [k, v] of Object.entries(parsed)) {
            out[k] = typeof v === 'string' ? v : String(v ?? '')
          }
          resolve(out)
        } catch (parseErr) {
          logger.error('Failed to parse env var JSON', { error: String(parseErr) })
          reject(parseErr)
        }
      }
    )
  })
}

/**
 * Read a single User Environment Variable via PowerShell.
 * Returns null if the variable does not exist.
 */
export async function readUserEnvVar(key: string): Promise<string | null> {
  const script = `[Environment]::GetEnvironmentVariable('${escapePS(key)}', 'User')`

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000 },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const value = stdout.trim()
        resolve(value === '' ? null : value)
      }
    )
  })
}

/**
 * Capture the current Windows env var state for a set of keys, producing
 * a SnapshotEntry array suitable for a pre-activation backup.
 */
export async function snapshotEnvVars(keys: string[]): Promise<SnapshotEntry[]> {
  if (keys.length === 0) return []
  const currentEnv = await readAllUserEnvVars()
  return keys.map(key => {
    const existed = Object.prototype.hasOwnProperty.call(currentEnv, key)
    return {
      key,
      previousValue: existed ? currentEnv[key] : null,
      existed,
    }
  })
}
