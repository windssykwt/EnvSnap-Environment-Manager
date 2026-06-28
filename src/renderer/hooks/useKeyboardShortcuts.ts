import { useEffect } from 'react'
import { useAppStore } from '../store'

/**
 * Global keyboard shortcuts for the app.
 *
 * Ctrl+N       — Create new preset
 * Ctrl+S       — Force save current preset
 * Ctrl+Shift+A — Activate selected preset
 * Ctrl+1/2/3   — Switch tabs (Presets/History/Settings)
 * Ctrl+F       — Focus sidebar search (on presets page)
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey

      // Don't intercept when user is in an input/textarea (except for our specific combos)
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Ctrl+N: Create new preset
      if (ctrl && !shift && e.key === 'n') {
        e.preventDefault()
        const store = useAppStore.getState()
        store.setCurrentPage('presets')
        const presets = store.presets
        const name = `Preset ${presets.length + 1}`
        store.createPreset(name).then(preset => {
          if (preset) store.selectPreset(preset.id)
        })
        return
      }

      // Ctrl+S: Force save (emit a custom event the PresetsPage listens for)
      if (ctrl && !shift && e.key === 's') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('envsnap:force-save'))
        return
      }

      // Ctrl+Shift+A: Activate selected preset
      if (ctrl && shift && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('envsnap:activate'))
        return
      }

      // Ctrl+1/2/3: Switch tabs
      if (ctrl && !shift && !isInput) {
        if (e.key === '1') {
          e.preventDefault()
          useAppStore.getState().setCurrentPage('presets')
          return
        }
        if (e.key === '2') {
          e.preventDefault()
          useAppStore.getState().setCurrentPage('backups')
          return
        }
        if (e.key === '3') {
          e.preventDefault()
          useAppStore.getState().setCurrentPage('settings')
          return
        }
      }

      // Ctrl+F: Focus sidebar search
      if (ctrl && !shift && e.key === 'f') {
        const searchInput = document.querySelector('.sidebar-search-input') as HTMLInputElement | null
        if (searchInput) {
          e.preventDefault()
          searchInput.focus()
          searchInput.select()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
