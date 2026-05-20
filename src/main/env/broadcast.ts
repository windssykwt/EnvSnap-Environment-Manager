import { execFile } from 'child_process'
import { logger } from '../logger'

export async function broadcastSettingChange(): Promise<void> {
  const script = `
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Win32{[DllImport("user32.dll",SetLastError=true,CharSet=CharSet.Auto)]public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,string l,uint f,uint t,out IntPtr r);}'
$result=[IntPtr]::Zero
[Win32]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',0x0002,5000,[ref]$result)
`.trim()

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000 },
      (err) => {
        if (err) {
          logger.error('Failed to broadcast WM_SETTINGCHANGE', { error: String(err) })
          // Non-fatal: env vars are still set, just not immediately visible to other processes
        }
        resolve()
      }
    )
  })
}
