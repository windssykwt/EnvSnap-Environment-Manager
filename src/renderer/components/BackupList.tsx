import { useEffect, useState } from 'react'
import type { Backup } from '../../shared/types'
import { useAppStore } from '../store'

export function BackupList() {
  const backups = useAppStore(s => s.backups)
  const loadBackups = useAppStore(s => s.loadBackups)
  const restoreBackup = useAppStore(s => s.restoreBackup)
  const restorePreActivation = useAppStore(s => s.restorePreActivation)
  const deleteBackup = useAppStore(s => s.deleteBackup)
  const deleteAllBackups = useAppStore(s => s.deleteAllBackups)
  const selectPreset = useAppStore(s => s.selectPreset)
  const setCurrentPage = useAppStore(s => s.setCurrentPage)
  const showConfirm = useAppStore(s => s.showConfirm)
  const showToast = useAppStore(s => s.showToast)

  const [previewBackup, setPreviewBackup] = useState<Backup | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadBackups()
  }, [])

  useEffect(() => {
    setRevealedKeys(new Set())
  }, [previewBackup?.id])

  const itemCount = (backup: Backup) =>
    backup.kind === 'preset-archive' ? backup.variables.length : backup.snapshot.length

  const kindLabel = (backup: Backup) =>
    backup.kind === 'preset-archive' ? 'Deleted preset' : 'Pre-activation snapshot'

  const handleRestoreArchive = (backupId: string, presetName: string) => {
    showConfirm(
      'Restore Preset',
      `Restore "${presetName}" from history? It will appear in the Presets tab. Activate it manually to apply to Windows.`,
      async () => {
        const preset = await restoreBackup(backupId)
        if (preset) {
          selectPreset(preset.id)
          setCurrentPage('presets')
          showToast(`Preset "${preset.name}" restored`, 'success')
        } else {
          showToast('Failed to restore preset', 'error')
        }
      },
    )
  }

  const handleRollback = (backupId: string, presetName: string, snapshotSize: number) => {
    showConfirm(
      'Roll Back Activation',
      `Restore Windows User Environment Variables to the state right before "${presetName}" was applied? ${snapshotSize} variable${snapshotSize === 1 ? '' : 's'} will be re-written or removed.`,
      async () => {
        const result = await restorePreActivation(backupId)
        if (result) {
          const parts: string[] = []
          if (result.restoredCount) parts.push(`${result.restoredCount} restored`)
          if (result.deletedCount) parts.push(`${result.deletedCount} removed`)
          showToast(
            parts.length > 0 ? `Rolled back (${parts.join(', ')})` : 'Rolled back',
            'success',
          )
        } else {
          showToast('Failed to roll back', 'error')
        }
      },
    )
  }

  const handleDelete = (backup: Backup) => {
    const label = backup.kind === 'preset-archive' ? 'archived preset' : 'pre-activation snapshot'
    showConfirm(
      'Delete from History',
      `Permanently delete the ${label} "${backup.presetName}" from ${new Date(backup.createdAt).toLocaleString()}? This cannot be undone.`,
      async () => {
        const success = await deleteBackup(backup.id)
        if (success) {
          showToast('Removed from history', 'success')
        } else {
          showToast('Failed to delete entry', 'error')
        }
      },
    )
  }

  const handleDeleteAll = () => {
    showConfirm(
      'Clear History',
      `Permanently delete all ${backups.length} entr${backups.length === 1 ? 'y' : 'ies'}? This cannot be undone.`,
      async () => {
        const count = await deleteAllBackups()
        if (count > 0) {
          showToast(`Cleared ${count} entr${count === 1 ? 'y' : 'ies'}`, 'success')
        } else {
          showToast('Failed to clear history', 'error')
        }
      },
    )
  }

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const maskValue = (value: string) => {
    if (!value) return ''
    if (value.length <= 4) return '\u2022'.repeat(value.length)
    return value.slice(0, 2) + '\u2022'.repeat(Math.min(value.length - 4, 12)) + value.slice(-2)
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <h2 className="history-title">History</h2>
        {backups.length > 0 && (
          <button className="btn-clear-history" onClick={handleDeleteAll}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Clear History
          </button>
        )}
      </div>

      {backups.length === 0 ? (
        <p className="history-empty">No history entries yet.</p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Preset</th>
              <th>Items</th>
              <th className="history-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(backup => (
              <tr key={backup.id}>
                <td>{new Date(backup.createdAt).toLocaleString()}</td>
                <td>
                  <span className={`history-kind ${backup.kind}`}>
                    {kindLabel(backup)}
                  </span>
                </td>
                <td className="history-preset-name">{backup.presetName}</td>
                <td>{itemCount(backup)}</td>
                <td className="history-col-actions">
                  <button
                    className="history-icon-btn"
                    onClick={() => setPreviewBackup(backup)}
                    title="Preview"
                    aria-label={`Preview ${backup.presetName}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  {backup.kind === 'preset-archive' ? (
                    <button
                      className="history-icon-btn"
                      onClick={() => handleRestoreArchive(backup.id, backup.presetName)}
                      title="Restore as preset"
                      aria-label={`Restore ${backup.presetName}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      className="history-icon-btn"
                      onClick={() => handleRollback(backup.id, backup.presetName, backup.snapshot.length)}
                      title="Roll back to this state"
                      aria-label={`Roll back ${backup.presetName}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    </button>
                  )}
                  <button
                    className="history-icon-btn history-icon-btn-danger"
                    onClick={() => handleDelete(backup)}
                    title="Delete from history"
                    aria-label={`Delete ${backup.presetName}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {previewBackup && (
        <div className="modal-overlay" onClick={() => setPreviewBackup(null)}>
          <div className="modal preview-modal" onClick={e => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div>
                <h3>{previewBackup.presetName}</h3>
                <p className="preview-modal-meta">
                  {kindLabel(previewBackup)} &middot; {new Date(previewBackup.createdAt).toLocaleString()} &middot; {itemCount(previewBackup)} variable{itemCount(previewBackup) === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="preview-modal-body">
              {previewBackup.kind === 'preset-archive' ? (
                previewBackup.variables.length === 0 ? (
                  <p className="empty-state" style={{ margin: 0 }}>This preset had no variables.</p>
                ) : (
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {previewBackup.variables.map((v, idx) => {
                        const rowKey = `${v.key}-${idx}`
                        const revealed = revealedKeys.has(rowKey)
                        return (
                          <tr key={rowKey}>
                            <td className="preview-cell-key">{v.key}</td>
                            <td className="preview-cell-value">
                              <span className={revealed ? 'preview-value' : 'preview-value masked'}>
                                {revealed ? v.value : maskValue(v.value)}
                              </span>
                            </td>
                            <td className="preview-cell-actions">
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => toggleReveal(rowKey)}
                                title={revealed ? 'Hide value' : 'Show value'}
                              >
                                {revealed ? 'Hide' : 'Show'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                style={{ marginLeft: 6 }}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(v.value)
                                    showToast(`Copied "${v.key}"`, 'success')
                                  } catch {
                                    showToast('Failed to copy', 'error')
                                  }
                                }}
                                title="Copy value to clipboard"
                              >
                                Copy
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              ) : previewBackup.snapshot.length === 0 ? (
                <p className="empty-state" style={{ margin: 0 }}>No variables were captured.</p>
              ) : (
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Previous value</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {previewBackup.snapshot.map((entry, idx) => {
                      const rowKey = `${entry.key}-${idx}`
                      const revealed = revealedKeys.has(rowKey)
                      const display = entry.existed ? (entry.previousValue ?? '') : ''
                      return (
                        <tr key={rowKey}>
                          <td className="preview-cell-key">{entry.key}</td>
                          <td className="preview-cell-value">
                            {entry.existed ? (
                              <span className={revealed ? 'preview-value' : 'preview-value masked'}>
                                {revealed ? display : maskValue(display)}
                              </span>
                            ) : (
                              <span className="preview-value" style={{ opacity: 0.6 }}>
                                (was not set)
                              </span>
                            )}
                          </td>
                          <td className="preview-cell-actions">
                            {entry.existed && (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => toggleReveal(rowKey)}
                                title={revealed ? 'Hide value' : 'Show value'}
                              >
                                {revealed ? 'Hide' : 'Show'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPreviewBackup(null)}>Close</button>
              {previewBackup.kind === 'preset-archive' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const target = previewBackup
                    setPreviewBackup(null)
                    handleRestoreArchive(target.id, target.presetName)
                  }}
                >
                  Restore
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const target = previewBackup
                    setPreviewBackup(null)
                    handleRollback(target.id, target.presetName, target.snapshot.length)
                  }}
                >
                  Roll Back
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
