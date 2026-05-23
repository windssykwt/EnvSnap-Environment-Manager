/**
 * Encryption layer using Electron's safeStorage API.
 *
 * On Windows this delegates to DPAPI (Data Protection API), which ties
 * the encrypted blob to the current OS user account. Files stolen from
 * %APPDATA% cannot be decrypted on another machine or by another user.
 *
 * The module exposes two pairs:
 *   - encryptString / decryptString — for individual string payloads
 *   - encryptAndWrite / readAndDecrypt — atomic file I/O with encryption
 *
 * A magic header byte sequence identifies encrypted files so the loader
 * can transparently migrate plain-text JSON on first read.
 */

import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { safeStorage } from 'electron'
import { logger } from '../logger'

/**
 * 4-byte magic header prepended to every encrypted file so we can
 * distinguish encrypted blobs from legacy plain-text JSON.
 * "ENVS" in ASCII = 0x45 0x4E 0x56 0x53
 */
const MAGIC_HEADER = Buffer.from([0x45, 0x4e, 0x56, 0x53])

/**
 * Check whether Electron's safeStorage encryption is available on this
 * system. On Windows this requires DPAPI which is always present, but
 * we guard anyway for robustness.
 */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * Encrypt a UTF-8 string using safeStorage (DPAPI on Windows).
 * Returns a Buffer containing MAGIC_HEADER + encrypted payload.
 */
export function encryptString(plaintext: string): Buffer {
  const encrypted = safeStorage.encryptString(plaintext)
  return Buffer.concat([MAGIC_HEADER, encrypted])
}

/**
 * Decrypt a buffer that was produced by `encryptString`.
 * Strips the magic header before passing to safeStorage.
 */
export function decryptString(buffer: Buffer): string {
  // Strip magic header
  const payload = buffer.subarray(MAGIC_HEADER.length)
  return safeStorage.decryptString(payload)
}

/**
 * Determine whether a file buffer starts with our magic header,
 * indicating it is encrypted.
 */
export function isEncryptedFile(buffer: Buffer): boolean {
  if (buffer.length < MAGIC_HEADER.length) return false
  return buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER)
}

/**
 * Read a file and decrypt it if encrypted, or return as plain UTF-8
 * if it's a legacy unencrypted file.
 *
 * Returns `{ content, wasEncrypted }` so callers can decide whether
 * to re-encrypt (migrate) the file.
 */
export function readFileWithDecryption(filePath: string): { content: string; wasEncrypted: boolean } | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath)

    if (isEncryptedFile(raw)) {
      const content = decryptString(raw)
      return { content, wasEncrypted: true }
    }

    // Legacy plain-text file
    return { content: raw.toString('utf-8'), wasEncrypted: false }
  } catch (err) {
    logger.error('Failed to read/decrypt file', { filePath, error: String(err) })
    return null
  }
}

/**
 * Atomic encrypted write. Same pattern as the existing atomicWriteAsync
 * but writes encrypted binary instead of plain text.
 *
 * Falls back to plain-text write if encryption is not available (should
 * not happen on Windows, but provides graceful degradation).
 */
export async function atomicEncryptedWrite(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tmpPath = filePath + '.tmp'

  let payload: Buffer | string
  if (isEncryptionAvailable()) {
    payload = encryptString(data)
  } else {
    logger.warn('safeStorage encryption not available — writing plain text', { filePath })
    payload = data
  }

  const fh = await fsp.open(tmpPath, 'w')
  try {
    if (Buffer.isBuffer(payload)) {
      await fh.write(payload)
    } else {
      await fh.writeFile(payload, 'utf-8')
    }
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fsp.rename(tmpPath, filePath)

  // Best-effort dir fsync (not supported on Windows for directories)
  try {
    const dirHandle = await fsp.open(dir, 'r')
    try {
      await dirHandle.sync()
    } finally {
      await dirHandle.close()
    }
  } catch {
    // ignore
  }
}
