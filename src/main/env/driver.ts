import { spawn } from 'child_process'
import { logger } from '../logger'

/**
 * One PowerShell driver script handles every env-var operation. It
 * reads a JSON payload from stdin and writes one JSON line per result
 * to stdout, so we don't have to interpolate user-supplied values into
 * a script string at all. That kills an entire class of escaping bugs
 * (newlines, single quotes, backticks, etc.).
 *
 * Input shape:
 *   { ops: [
 *       { op: 'set', key: 'FOO', value: 'bar' },
 *       { op: 'delete', key: 'BAZ' },
 *   ] }
 *
 * Output: one JSON object per line, in input order:
 *   { key: 'FOO', op: 'set', ok: true }
 *   { key: 'BAZ', op: 'delete', ok: false, error: 'message' }
 *
 * The script is passed to PowerShell via -EncodedCommand so we can
 * embed it verbatim without worrying about argv shell rules.
 */
const APPLY_SCRIPT = `
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
try {
  $payload = $raw | ConvertFrom-Json
} catch {
  Write-Output (@{ fatal = $true; error = "invalid input json: $($_.Exception.Message)" } | ConvertTo-Json -Compress)
  exit 2
}
if (-not $payload.ops) {
  Write-Output (@{ fatal = $true; error = 'missing ops' } | ConvertTo-Json -Compress)
  exit 2
}
foreach ($op in $payload.ops) {
  $result = [ordered]@{ key = $op.key; op = $op.op; ok = $false }
  try {
    if ($op.op -eq 'set') {
      [Environment]::SetEnvironmentVariable($op.key, [string]$op.value, 'User')
      $result.ok = $true
    } elseif ($op.op -eq 'delete') {
      [Environment]::SetEnvironmentVariable($op.key, [NullString]::Value, 'User')
      $result.ok = $true
    } else {
      $result.error = "unknown op: $($op.op)"
    }
  } catch {
    $result.error = $_.Exception.Message
  }
  Write-Output ($result | ConvertTo-Json -Compress)
}
`.trim()

/**
 * Reads HKCU\Environment via the .NET API as a hashtable and emits a
 * single JSON object. Avoids parsing reg.exe output entirely, so env
 * var names with spaces and unicode work.
 */
const READ_ALL_SCRIPT = `
$ErrorActionPreference = 'Stop'
$vars = [Environment]::GetEnvironmentVariables('User')
$out = @{}
foreach ($key in $vars.Keys) { $out[$key] = [string]$vars[$key] }
Write-Output ($out | ConvertTo-Json -Compress)
`.trim()

function encodeForPwsh(script: string): string {
  // PowerShell -EncodedCommand wants UTF-16LE base64.
  return Buffer.from(script, 'utf16le').toString('base64')
}

interface DriverOptions {
  timeoutMs?: number
}

function runEncoded(
  script: string,
  stdin: string,
  options: DriverOptions = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeForPwsh(script)],
      { windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    let killed = false

    const timer = options.timeoutMs
      ? setTimeout(() => {
          killed = true
          try {
            child.kill()
          } catch {
            // ignore
          }
        }, options.timeoutMs)
      : null

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', err => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr: stderr || String(err), code: null })
    })
    child.on('close', code => {
      if (timer) clearTimeout(timer)
      if (killed) {
        resolve({ stdout, stderr: stderr || 'timeout', code: null })
      } else {
        resolve({ stdout, stderr, code })
      }
    })

    if (stdin.length > 0) {
      child.stdin.end(stdin, 'utf-8')
    } else {
      child.stdin.end()
    }
  })
}

export interface OpResult {
  key: string
  op: 'set' | 'delete'
  ok: boolean
  error?: string
}

/**
 * Run a batch of set/delete operations against User Environment
 * Variables. Returns one result per input op. Order preserved.
 *
 * Network-style failure (PowerShell didn't even start, JSON parse
 * failure, etc.) is reported as a synthetic per-op failure so callers
 * can still aggregate.
 */
export async function runOps(
  ops: Array<{ op: 'set'; key: string; value: string } | { op: 'delete'; key: string }>,
  options: DriverOptions = { timeoutMs: 30000 },
): Promise<OpResult[]> {
  if (ops.length === 0) return []
  const payload = JSON.stringify({ ops })
  const { stdout, stderr, code } = await runEncoded(APPLY_SCRIPT, payload, options)

  if (code !== 0 && stderr.trim()) {
    // Hard failure (PowerShell itself errored). Report each op as
    // failed using the stderr so the caller has something to surface
    // without leaking the entire stream to the renderer.
    const reason = stderr.trim().slice(0, 200)
    logger.error('PowerShell driver failed', { reason })
    return ops.map(op => ({ key: op.key, op: op.op, ok: false, error: reason }))
  }

  // Each output line is one JSON object. Tolerate stray lines
  // (e.g. profile output despite -NoProfile) by skipping non-JSON.
  const results: OpResult[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: any
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (parsed?.fatal === true) {
      // Driver script-level failure.
      logger.error('PowerShell driver fatal', { error: String(parsed.error) })
      return ops.map(op => ({
        key: op.key,
        op: op.op,
        ok: false,
        error: String(parsed.error ?? 'driver fatal'),
      }))
    }
    if (typeof parsed?.key === 'string' && typeof parsed?.ok === 'boolean') {
      results.push({
        key: parsed.key,
        op: parsed.op === 'delete' ? 'delete' : 'set',
        ok: parsed.ok,
        error: typeof parsed.error === 'string' ? parsed.error : undefined,
      })
    }
  }

  // If the driver returned fewer results than ops (truncated stream,
  // partial crash), synthesise failures for the missing ones so the
  // caller sees real numbers.
  if (results.length < ops.length) {
    const seen = new Set(results.map(r => `${r.op}:${r.key}`))
    for (const op of ops) {
      const id = `${op.op}:${op.key}`
      if (!seen.has(id)) {
        results.push({
          key: op.key,
          op: op.op,
          ok: false,
          error: 'no result returned by driver',
        })
      }
    }
  }
  return results
}

/**
 * Read all User Environment Variables as a key/value map. Throws on
 * driver failure so the caller can decide to retry or surface an error.
 */
export async function readAllUserEnvVarsViaDriver(): Promise<Record<string, string>> {
  const { stdout, stderr, code } = await runEncoded(READ_ALL_SCRIPT, '', { timeoutMs: 10000 })
  if (code !== 0) {
    throw new Error(stderr.trim() || `powershell exited with code ${code}`)
  }
  const trimmed = stdout.trim()
  if (!trimmed) return {}
  let parsed: any
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    throw new Error(`failed to parse env var list: ${String(err)}`)
  }
  // ConvertTo-Json on an empty hashtable returns "{}"; on a single key
  // it returns an object; on many keys also an object. Always coerce.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof k === 'string' && typeof v === 'string') {
      out[k] = v
    } else if (typeof k === 'string' && v !== null && v !== undefined) {
      // ConvertTo-Json sometimes wraps very long strings in objects;
      // best-effort stringify so we don't drop data silently.
      out[k] = String(v)
    }
  }
  return out
}
