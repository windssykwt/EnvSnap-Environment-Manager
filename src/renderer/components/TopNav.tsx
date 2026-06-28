import { useAppStore } from '../store'
import { getEnvApi } from '../hooks/useEnvApi'
import type { Page } from '../store/uiStore'

export function TopNav() {
  const currentPage = useAppStore(s => s.currentPage)
  const setCurrentPage = useAppStore(s => s.setCurrentPage)

  const tabs: { key: Page; label: string }[] = [
    { key: 'presets', label: 'Presets' },
    { key: 'backups', label: 'History' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <nav className="topnav">
      <div className="topnav-brand">
        <span className="brand-main">EnvSnap</span>
        <span className="brand-sub">Windows</span>
      </div>
      <div className="topnav-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`topnav-tab${currentPage === tab.key ? ' active' : ''}`}
            onClick={() => setCurrentPage(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="window-controls">
        <button
          className="window-btn"
          aria-label="Minimize"
          onClick={() => getEnvApi()?.window?.minimize()}
        >
          <span className="window-icon window-icon-min">—</span>
        </button>
        <button
          className="window-btn"
          aria-label="Maximize"
          onClick={() => getEnvApi()?.window?.maximizeToggle()}
        >
          <span className="window-icon window-icon-max">▢</span>
        </button>
        <button
          className="window-btn window-btn-close"
          aria-label="Close"
          onClick={() => getEnvApi()?.window?.close()}
        >
          <span className="window-icon window-icon-close">×</span>
        </button>
      </div>
    </nav>
  )
}
