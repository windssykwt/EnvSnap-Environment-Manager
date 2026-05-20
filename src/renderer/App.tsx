import { useEffect } from 'react'
import { useAppStore } from './store'
import { TopNav } from './components/TopNav'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toast } from './components/Toast'
import { PresetsPage } from './pages/PresetsPage'
import { BackupsPage } from './pages/BackupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { usePresetActivated } from './hooks/useEnvApi'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const currentPage = useAppStore(s => s.currentPage)

  // Apply theme (light/dark/system) to document root
  useTheme()

  // Listen for activation events from the main process (tray clicks). They
  // change the active preset, so reload the preset list to refresh the
  // sidebar's active highlight.
  usePresetActivated(() => {
    const store = useAppStore.getState()
    store.loadPresets()
  })

  // Load initial data
  useEffect(() => {
    const store = useAppStore.getState()
    store.loadPresets()
    store.loadSettings()
  }, [])

  return (
    <div className="app">
      <TopNav />
      <div className="app-content">
        {currentPage === 'presets' && <PresetsPage />}
        {currentPage === 'backups' && <BackupsPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </div>
      <ConfirmDialog />
      <Toast />
    </div>
  )
}
