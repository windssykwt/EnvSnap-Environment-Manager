import { useState } from 'react'
import { useAppStore } from '../store'
import { ThemeSwitcher } from './ThemeSwitcher'
import type { ThemeMode } from '../../shared/types'

export function SettingsPanel() {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const showToast = useAppStore(s => s.showToast)
  const showConfirm = useAppStore(s => s.showConfirm)
  const loadSettings = useAppStore(s => s.loadSettings)
  const loadPresets = useAppStore(s => s.loadPresets)
  const loadBackups = useAppStore(s => s.loadBackups)

  const [storageDraft, setStorageDraft] = useState<string | null>(null)
  const displayStorage = storageDraft !== null ? storageDraft : settings.storageLocation

  const handleToggle = async (key: keyof typeof settings) => {
    await updateSettings({ [key]: !settings[key] })
    showToast('Setting updated', 'success')
  }

  const handleStorageBrowse = async () => {
    const api = (window as any).envApi
    if (!api?.dialog?.saveFile) return
    const result = await api.dialog.saveFile({
      filters: [{ name: 'Folder', extensions: [''] }],
      defaultPath: settings.storageLocation || undefined,
    })
    // showSaveDialog returns a file path — we want the directory part.
    if (result.success && result.data) {
      const filePath: string = result.data
      // Strip filename if the user typed one; we want the directory.
      const dirPath = filePath.replace(/[/\\][^/\\]+$/, '') || filePath
      setStorageDraft(dirPath)
    }
  }

  const handleStorageSave = async () => {
    if (storageDraft === null) return
    const path = storageDraft.trim()
    await updateSettings({ storageLocation: path })
    setStorageDraft(null)
    showToast('Storage location updated. Restart the app to apply.', 'success')
  }

  const handleStorageReset = async () => {
    setStorageDraft(null)
    await updateSettings({ storageLocation: '' })
    showToast('Storage location reset to default. Restart the app to apply.', 'success')
  }

  const handleThemeChange = async (mode: ThemeMode) => {
    await updateSettings({ theme: mode })
    showToast('Theme updated', 'success')
  }

  const handleExportConfig = async () => {
    const api = (window as any).envApi
    if (!api?.config?.exportConfig) return
    const result = await api.config.exportConfig()
    if (result.success) {
      showToast('Config exported successfully', 'success')
    } else {
      showToast(result.error?.message ?? 'Failed to export config', 'error')
    }
  }

  const handleImportConfig = async () => {
    const api = (window as any).envApi
    if (!api?.config?.importConfig) return

    showConfirm(
      'Import Configuration',
      'Importing will replace your presets, backups, and settings. Continue?',
      async () => {
        const result = await api.config.importConfig()
        if (result.success) {
          await Promise.all([loadSettings(), loadPresets(), loadBackups()])
          showToast('Config imported successfully', 'success')
        } else {
          showToast(result.error?.message ?? 'Failed to import config', 'error')
        }
      },
      { destructive: true, confirmLabel: 'Replace' },
    )
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      <div className="settings-groups">
        <div className="settings-group">
          <div className="settings-subtitle">Appearance</div>
          <div className="setting-row setting-row-appearance">
            <span>Theme</span>
            <ThemeSwitcher value={settings.theme} onChange={handleThemeChange} />
          </div>
        </div>

        <div className="settings-group">
          <label className="setting-row">
            <span>Launch on Windows startup</span>
            <input
              type="checkbox"
              checked={settings.launchOnStartup}
              onChange={() => handleToggle('launchOnStartup')}
            />
          </label>
          <label className="setting-row">
            <span>Minimize to tray on close</span>
            <input
              type="checkbox"
              checked={settings.minimizeToTray}
              onChange={() => handleToggle('minimizeToTray')}
            />
          </label>
          <label className="setting-row">
            <span>Show notification after activation</span>
            <input
              type="checkbox"
              checked={settings.showNotification}
              onChange={() => handleToggle('showNotification')}
            />
          </label>
          <label className="setting-row">
            <span>Confirm before applying preset</span>
            <input
              type="checkbox"
              checked={settings.confirmBeforeApply}
              onChange={() => handleToggle('confirmBeforeApply')}
            />
          </label>
        </div>

        <div className="settings-group">
          <div className="settings-subtitle">Storage Location</div>
          <p className="settings-hint">
            Where preset and backup data is stored. Leave empty to use the default app data folder.
            Changes take effect after restarting the app.
          </p>
          <div className="setting-row setting-row-column">
            <div className="storage-input-row">
              <input
                className="storage-location-input"
                type="text"
                placeholder="Default (app data folder)"
                value={displayStorage}
                onChange={e => setStorageDraft(e.target.value)}
                spellCheck={false}
              />
              <button className="btn btn-secondary" onClick={handleStorageBrowse} title="Browse for a folder">
                Browse
              </button>
            </div>
            <div className="storage-actions">
              <button
                className="btn btn-primary"
                onClick={handleStorageSave}
                disabled={storageDraft === null}
              >
                Save
              </button>
              {settings.storageLocation && (
                <button className="btn btn-ghost" onClick={handleStorageReset}>
                  Reset to Default
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="settings-group settings-group-secondary">
          <div className="settings-subtitle">Data Transfer</div>
          <div className="setting-row">
            <span>Export configuration</span>
            <button className="btn btn-secondary" onClick={handleExportConfig}>Export</button>
          </div>
          <div className="setting-row">
            <span>Import configuration</span>
            <button className="btn btn-secondary" onClick={handleImportConfig}>Import</button>
          </div>
        </div>
      </div>
    </div>
  )
}
