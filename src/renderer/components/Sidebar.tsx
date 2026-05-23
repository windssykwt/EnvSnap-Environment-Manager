import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAppStore } from '../store'

/** Debounce window for sidebar rename writes. */
const RENAME_DEBOUNCE_MS = 250

export function Sidebar() {
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ presetId: string; x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Local draft of the name being typed, so we can render every keystroke
  // without firing an IPC update for each one.
  const [draftName, setDraftName] = useState<string>('')
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const presets = useAppStore(s => s.presets)
  const selectedPresetId = useAppStore(s => s.selectedPresetId)
  const activePresetId = useAppStore(s => s.activePresetId)
  const selectPreset = useAppStore(s => s.selectPreset)
  const createPreset = useAppStore(s => s.createPreset)
  const updatePreset = useAppStore(s => s.updatePreset)
  const deletePreset = useAppStore(s => s.deletePreset)
  const showConfirm = useAppStore(s => s.showConfirm)
  const showToast = useAppStore(s => s.showToast)

  const handleDeleteFromSidebar = (e: MouseEvent, presetId: string, presetName: string) => {
    e.stopPropagation()
    const isActive = activePresetId === presetId
    const warning = isActive ? ' Its variables will be removed from Windows.' : ''
    showConfirm(
      'Delete Preset',
      `Delete "${presetName}"?${warning} It will move to History where you can restore it later.`,
      async () => {
        const success = await deletePreset(presetId)
        if (success) {
          showToast('Preset moved to history', 'success')
        }
      },
      { destructive: true, confirmLabel: 'Delete' },
    )
  }

  const handleNewPreset = async () => {
    const name = `Preset ${presets.length + 1}`
    const preset = await createPreset(name)
    if (preset) {
      selectPreset(preset.id)
    }
  }

  useEffect(() => {
    if (editingPresetId) {
      const current = presets.find(p => p.id === editingPresetId)
      setDraftName(current?.name ?? '')
      // Defer focus to give the input time to mount.
      queueMicrotask(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    } else {
      setDraftName('')
    }
    // We intentionally re-init draft only when the editing target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPresetId])

  useEffect(() => {
    if (!contextMenu) return

    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', closeMenu)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('keydown', closeMenu)
    }
  }, [contextMenu])

  // Cancel any pending rename write on unmount.
  useEffect(() => {
    return () => {
      if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
    }
  }, [])

  const handleContextMenu = (event: MouseEvent, presetId: string) => {
    event.preventDefault()
    event.stopPropagation()
    selectPreset(presetId)
    setContextMenu({ presetId, x: event.clientX, y: event.clientY })
  }

  const startRename = (presetId: string) => {
    setContextMenu(null)
    setEditingPresetId(presetId)
  }

  const flushRename = async (presetId: string, name: string) => {
    if (renameTimerRef.current) {
      clearTimeout(renameTimerRef.current)
      renameTimerRef.current = null
    }
    const trimmed = name.trim()
    if (trimmed === '') return
    const current = presets.find(p => p.id === presetId)
    if (!current || current.name === trimmed) return
    await updatePreset(presetId, { name: trimmed })
  }

  const handleDraftChange = (presetId: string, value: string) => {
    setDraftName(value)
    if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
    renameTimerRef.current = setTimeout(() => {
      // Trim/empty-guard happens inside flushRename so the trailing
      // whitespace the user is currently typing isn't committed mid-edit.
      void flushRename(presetId, value)
    }, RENAME_DEBOUNCE_MS)
  }

  const finishEditing = async (presetId: string, commit: boolean) => {
    if (commit) {
      await flushRename(presetId, draftName)
    } else if (renameTimerRef.current) {
      clearTimeout(renameTimerRef.current)
      renameTimerRef.current = null
    }
    setEditingPresetId(null)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="btn-create-large" onClick={handleNewPreset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create New
        </button>
      </div>
      <ul className="sidebar-list">
        {presets.length === 0 && (
          <li className="sidebar-empty">No presets yet. Create one to get started.</li>
        )}
        {presets.map(preset => {
          const isSelected = selectedPresetId === preset.id
          const isEditing = editingPresetId === preset.id
          // While editing, render the in-flight draft so the keystrokes
          // don't snap back when an IPC update lands later.
          const displayName = isEditing ? draftName : preset.name

          return (
            <li
              key={preset.id}
              className={`sidebar-item${isSelected ? ' selected' : ''}${activePresetId === preset.id ? ' active' : ''}`}
              onClick={() => selectPreset(preset.id)}
              onContextMenu={e => handleContextMenu(e, preset.id)}
            >
              <div className="sidebar-item-content">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className="sidebar-item-name-input"
                    value={displayName}
                    onChange={e => handleDraftChange(preset.id, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void finishEditing(preset.id, true)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        void finishEditing(preset.id, false)
                      }
                    }}
                    onBlur={() => void finishEditing(preset.id, true)}
                    aria-label="Preset name"
                  />
                ) : (
                  <span className="sidebar-item-name">{displayName}</span>
                )}
                <span className="sidebar-item-count">{preset.variables.length} vars</span>
              </div>
              <button
                className="sidebar-item-close"
                onClick={e => handleDeleteFromSidebar(e, preset.id, preset.name)}
                title="Delete preset"
                aria-label={`Delete ${preset.name}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              {activePresetId === preset.id && <div className="active-indicator-dot" />}
            </li>
          )
        })}
      </ul>
      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => startRename(contextMenu.presetId)}>Rename</button>
        </div>
      )}
    </aside>
  )
}
