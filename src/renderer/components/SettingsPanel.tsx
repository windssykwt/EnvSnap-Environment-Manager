import { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import { getEnvApi } from '../hooks/useEnvApi'
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

  const activePresetId = useAppStore(s => s.activePresetId)
  const presets = useAppStore(s => s.presets)

  const [storageDraft, setStorageDraft] = useState<string | null>(null)
  const [defaultStoragePath, setDefaultStoragePath] = useState<string>('')
  const displayStorage = storageDraft !== null ? storageDraft : (settings.storageLocation || defaultStoragePath)
  const trayActivePreset = presets.find(p => p.id === activePresetId)

  useEffect(() => {
    const api = getEnvApi()
    api?.settings?.getDefaultPath().then(r => {
      if (r.success && r.data) setDefaultStoragePath(r.data)
    })
  }, [])

  const handleToggle = async (key: keyof typeof settings) => {
    await updateSettings({ [key]: !settings[key] })
    showToast('Setting updated', 'success')
  }

  const handleStorageBrowse = async () => {
    const api = getEnvApi()
    if (!api?.dialog?.openDirectory) return
    const result = await api.dialog.openDirectory()
    if (result.success && result.data) {
      setStorageDraft(result.data)
    }
  }

  const handleStorageSave = async () => {
    if (storageDraft === null) return
    const path = storageDraft.trim()
    await updateSettings({ storageLocation: path })
    setStorageDraft(null)
    showConfirm(
      'Restart Required',
      'Storage location has been updated. Restart EnvSnap now to use the new location?',
      () => {
        const api = getEnvApi()
        api?.window?.relaunch()
      },
      { confirmLabel: 'Restart Now' },
    )
  }

  const handleStorageReset = async () => {
    setStorageDraft(null)
    await updateSettings({ storageLocation: '' })
    showConfirm(
      'Restart Required',
      'Storage location has been reset to default. Restart EnvSnap now?',
      () => {
        const api = getEnvApi()
        api?.window?.relaunch()
      },
      { confirmLabel: 'Restart Now' },
    )
  }

  const handleThemeChange = async (mode: ThemeMode) => {
    await updateSettings({ theme: mode })
    showToast('Theme updated', 'success')
  }

  const handleExportConfig = async () => {
    const api = getEnvApi()
    if (!api?.config?.exportConfig) return
    const result = await api.config.exportConfig()
    if (result.success) {
      showToast('Config exported successfully', 'success')
    } else {
      showToast(result.error?.message ?? 'Failed to export config', 'error')
    }
  }

  const handleImportConfig = async () => {
    const api = getEnvApi()
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

  const folderNames = useAppStore(s => s.folderNames)
  const addFolder = useAppStore(s => s.addFolder)

  const handleExportProfile = async () => {
    const api = getEnvApi()
    if (!api?.profile?.export) return
    const result = await api.profile.export(folderNames)
    if (result.success) {
      showToast('Profile exported successfully', 'success')
    } else {
      showToast(result.error?.message ?? 'Failed to export profile', 'error')
    }
  }

  const handleImportProfile = async () => {
    const api = getEnvApi()
    if (!api?.profile?.import) return
    const result = await api.profile.import()
    if (result.success && result.data) {
      const { folderNames: importedFolders, presetCount } = result.data
      for (const f of importedFolders) {
        addFolder(f)
      }
      await loadPresets()
      showToast(`Profile imported: ${presetCount} preset${presetCount === 1 ? '' : 's'} added`, 'success')
    } else if (!result.success) {
      showToast(result.error?.message ?? 'Failed to import profile', 'error')
    }
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
          <div className="settings-subtitle">System Tray</div>
          <div className="setting-row tray-preview-row">
            <div className={`tray-icon-preview${trayActivePreset ? ' is-active' : ''}`}>
              <div className="tray-icon-bg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 16v1a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1" />
                  <path d="M8 12h8" />
                  <rect x="4" y="4" width="16" height="12" rx="2" />
                </svg>
              </div>
              <span className={`tray-icon-dot${trayActivePreset ? ' active' : ''}`} />
            </div>
            <div className="tray-status">
              <div className="tray-status-title">System Tray</div>
              <div className="tray-status-sub">
                {trayActivePreset ? `Active: ${trayActivePreset.name}` : 'No active preset'}
              </div>
            </div>
          </div>
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
            Where preset and backup data is stored. Leave empty to use the default path.
            Changes take effect after restarting the app.
          </p>
          <div className="setting-row setting-row-column">
            <div className="storage-input-row">
              <input
                className="storage-location-input"
                type="text"
                placeholder={defaultStoragePath || 'Default (app data folder)'}
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

        <div className="settings-group settings-group-secondary">
          <div className="settings-subtitle">Profile</div>
          <p className="settings-hint">
            Export or import your presets and folder structure as a single shareable JSON file.
          </p>
          <div className="setting-row">
            <span>Export profile</span>
            <button className="btn btn-secondary" onClick={handleExportProfile}>Export</button>
          </div>
          <div className="setting-row">
            <span>Import profile</span>
            <button className="btn btn-secondary" onClick={handleImportProfile}>Import</button>
          </div>
        </div>
      </div>
    </div>
  )
}
