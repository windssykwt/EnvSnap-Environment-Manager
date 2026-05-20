import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function getLogPaths(): { dir: string; file: string } {
  const dir = path.join(app.getPath('appData'), 'ENVChanger')
  return { dir, file: path.join(dir, 'app.log') }
}

function ensureLogDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function maskValue(value: string): string {
  return '***REDACTED***'
}

function formatMessage(level: string, message: string, meta?: Record<string, string>): string {
  const ts = new Date().toISOString()
  let line = `${ts} [${level}] ${message}`
  if (meta) {
    const safe = Object.fromEntries(
      Object.entries(meta).map(([k, v]) => [k, k.toLowerCase().includes('value') ? maskValue(v) : v])
    )
    line += ` ${JSON.stringify(safe)}`
  }
  return line
}

function write(level: string, message: string, meta?: Record<string, string>): void {
  try {
    const paths = getLogPaths()
    ensureLogDir(paths.dir)
    const line = formatMessage(level, message, meta)
    fs.appendFileSync(paths.file, line + '\n')
    console.log(line)
  } catch {
    // logging failure should never crash the app
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, string>) => write('INFO', message, meta),
  warn: (message: string, meta?: Record<string, string>) => write('WARN', message, meta),
  error: (message: string, meta?: Record<string, string>) => write('ERROR', message, meta),
}
