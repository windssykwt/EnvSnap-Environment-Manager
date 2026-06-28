import { useState } from 'react'
import { useAppStore } from '../store'
import { getEnvApi } from '../hooks/useEnvApi'

interface PeekResult {
  filePath: string
  summary: Array<{ name: string; variableCount: number }>
  skipped: number
}

export function ImportDialog() {
  const [peek, setPeek] = useState<PeekResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const showToast = useAppStore(s => s.showToast)
  const loadPresets = useAppStore(s => s.loadPresets)

  const reset = () => {
    setPeek(null)
    setErrorMessage(null)
    setIsOpen(false)
    setIsImporting(false)
  }

  const handleOpen = async () => {
    const api = getEnvApi()
    if (!api?.importExport?.peek) return

    setIsLoading(true)
    try {
      const result = await api.importExport.peek()
      if (!result.success) {
        // Surface the validator's message directly so the user knows
        // exactly what is wrong with the file.
        setPeek(null)
        setErrorMessage(result.error?.message ?? 'Failed to read the file')
        setIsOpen(true)
        return
      }
      if (!result.data) {
        // User cancelled the dialog. Stay closed.
        return
      }
      setPeek(result.data)
      setErrorMessage(null)
      setIsOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    const api = getEnvApi()
    if (!api?.importExport?.importPresets) return

    setIsImporting(true)
    try {
      const result = await api.importExport.importPresets()
      if (result.success && result.data) {
        const { imported = 0, skipped = 0 } = result.data
        if (imported === 0 && skipped === 0) {
          showToast('Nothing imported', 'info')
        } else {
          const parts: string[] = [`${imported} imported`]
          if (skipped > 0) parts.push(`${skipped} skipped`)
          showToast(parts.join(', '), 'success')
        }
        await loadPresets()
        reset()
      } else {
        showToast(result.error?.message ?? 'Failed to import presets', 'error')
        setIsImporting(false)
      }
    } catch {
      showToast('Failed to import presets', 'error')
      setIsImporting(false)
    }
  }

  if (!isOpen) {
    return (
      <button className="btn btn-secondary" onClick={handleOpen} disabled={isLoading}>
        {isLoading ? 'Reading file…' : 'Import Presets'}
      </button>
    )
  }

  return (
    <div className="modal-overlay" onClick={reset}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Import Presets</h3>
        {errorMessage && (
          <div className="import-errors">
            <div className="error-item">{errorMessage}</div>
          </div>
        )}
        {peek && (
          <div className="import-preview">
            <p>Found {peek.summary.length} preset{peek.summary.length === 1 ? '' : 's'} in:</p>
            <p style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.75, wordBreak: 'break-all' }}>
              {peek.filePath}
            </p>
            <ul>
              {peek.summary.map((p, i) => (
                <li key={i}>{p.name} ({p.variableCount} variable{p.variableCount === 1 ? '' : 's'})</li>
              ))}
            </ul>
            {peek.skipped > 0 && (
              <p className="import-skipped" style={{ opacity: 0.75 }}>
                {peek.skipped} preset{peek.skipped === 1 ? '' : 's'} in the file failed validation and will be skipped.
              </p>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={reset} disabled={isImporting}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={isImporting || errorMessage !== null || !peek || peek.summary.length === 0}
          >
            {isImporting ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
