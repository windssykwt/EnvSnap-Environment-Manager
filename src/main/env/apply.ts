import { logger } from '../logger'
import { ENV_KEY_REGEX } from '../../shared/constants'
import { runOps } from './driver'

function isValidEnvKey(key: string): boolean {
  return ENV_KEY_REGEX.test(key)
}

/**
 * Apply a set of environment variable writes and deletes via the JSON stdin
 * driver (driver.ts). This avoids all string interpolation / escaping issues
 * that the legacy PowerShell path had.
 *
 * Returns a summary of applied/failed counts.
 */
export async function applyPresetVariables(
  variables: Array<{ key: string; value: string }>,
  keysToDelete: string[] = [],
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

  // Build ops array for the driver
  const ops: Array<{ op: 'set'; key: string; value: string } | { op: 'delete'; key: string }> = []

  for (const v of variables) {
    ops.push({ op: 'set', key: v.key, value: v.value })
  }

  for (const key of keysToDelete) {
    if (isValidEnvKey(key)) {
      ops.push({ op: 'delete', key })
    }
  }

  // Nothing to do
  if (ops.length === 0) {
    return { appliedCount: 0, failedVariables: [] }
  }

  const results = await runOps(ops, { timeoutMs: 30000 })

  const failed: Array<{ key: string; reason: string }> = []
  for (const r of results) {
    if (!r.ok) {
      failed.push({ key: r.key, reason: r.error ?? 'Unknown error' })
    }
  }

  if (failed.length > 0) {
    logger.error('Preset apply had failures', {
      failedCount: String(failed.length),
      totalOps: String(ops.length),
    })
  }

  return {
    appliedCount: variables.length - failed.filter(f => ops.find(o => o.op === 'set' && o.key === f.key)).length,
    failedVariables: failed,
  }
}
