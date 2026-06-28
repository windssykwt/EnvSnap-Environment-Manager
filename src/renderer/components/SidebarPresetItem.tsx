import { useRef, useEffect, useState, useCallback } from 'react'
import type { MouseEvent, DragEvent } from 'react'
import type { Preset } from '../../shared/types'
import { useAppStore } from '../store'

interface SidebarPresetItemProps {
  preset: Preset
  isSelected: boolean
  isActive: boolean
  isDragging: boolean
  isDragTarget: boolean
  dragPosition: 'before' | 'after' | null
  onDragStart: (e: DragEvent<HTMLLIElement>, presetId: string) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLLIElement>, preset: Preset) => void
  onDragLeave: (e: DragEvent<HTMLLIElement>, presetId: string) => void
  onDrop: (e: DragEvent<HTMLLIElement>, preset: Preset) => void
  selectedPresetIds: Set<string>
  onTogglePresetSelect: (id: string) => void
}

const RENAME_DEBOUNCE_MS = 250

export function SidebarPresetItem({
  preset,
  isSelected,
  isActive,
  isDragging,
  isDragTarget,
  dragPosition,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  selectedPresetIds,
  onTogglePresetSelect,
}: SidebarPresetItemProps) {
  const selectPreset = useAppStore(s => s.selectPreset)
  const updatePreset = useAppStore(s => s.updatePreset)
  const deletePreset = useAppStore(s => s.deletePreset)
  const showConfirm = useAppStore(s => s.showConfirm)
  const showToast = useAppStore(s => s.showToast)
  const activePresetId = useAppStore(s => s.activePresetId)

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingPresetId === preset.id) {
      setDraftName(preset.name)
      queueMicrotask(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPresetId, preset.id])

  // Cleanup rename timer on unmount
  useEffect(() => {
    return () => {
      if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
    }
  }, [])

  const flushRename = useCallback(async (name: string) => {
    if (renameTimerRef.current) {
      clearTimeout(renameTimerRef.current)
      renameTimerRef.current = null
    }
    const trimmed = name.trim()
    if (trimmed === '') return
    const current = useAppStore.getState().presets.find(p => p.id === preset.id)
    if (!current || current.name === trimmed) return
    await updatePreset(preset.id, { name: trimmed })
  }, [preset.id, updatePreset])

  const handleDraftChange = (value: string) => {
    setDraftName(value)
    if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
    renameTimerRef.current = setTimeout(() => {
      void flushRename(value)
    }, RENAME_DEBOUNCE_MS)
  }

  const finishEditing = async (presetId: string, commit: boolean) => {
    if (commit) {
      await flushRename(draftName)
    } else if (renameTimerRef.current) {
      clearTimeout(renameTimerRef.current)
      renameTimerRef.current = null
    }
    setEditingPresetId(null)
  }

  const startRename = () => {
    setEditingPresetId(preset.id)
  }

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation()
    const isActivePreset = activePresetId === preset.id
    const warning = isActivePreset ? ' Its variables will be removed from Windows.' : ''
    showConfirm(
      'Delete Preset',
      `Delete "${preset.name}"?${warning} It will move to History where you can restore it later.`,
      async () => {
        const success = await deletePreset(preset.id)
        if (success) {
          showToast('Preset moved to history', 'success')
        }
      },
      { destructive: true, confirmLabel: 'Delete' },
    )
  }

  const isEditing = editingPresetId === preset.id
  const displayName = isEditing ? draftName : preset.name

  const classes = [
    'sidebar-item',
    isSelected ? 'selected' : '',
    isActive ? 'active' : '',
    isDragging ? 'is-dragging' : '',
    isDragTarget && dragPosition === 'before' ? 'drop-before' : '',
    isDragTarget && dragPosition === 'after' ? 'drop-after' : '',
  ].filter(Boolean).join(' ')

  return (
    <li
      key={preset.id}
      className={classes}
      onClick={() => selectPreset(preset.id)}
      onDoubleClick={startRename}
      draggable
      onDragStart={e => onDragStart(e, preset.id)}
      onDragEnd={onDragEnd}
      onDragOver={e => onDragOver(e, preset)}
      onDragLeave={e => onDragLeave(e, preset.id)}
      onDrop={e => onDrop(e, preset)}
    >
      {isActive && (
        <span className="sidebar-active-badge" title="Currently active in Windows">
          <span className="sidebar-active-badge-dot" />
        </span>
      )}
      <label
        className={`sidebar-checkbox${selectedPresetIds.has(preset.id) ? ' is-checked' : ''}`}
        onClick={e => e.stopPropagation()}
        aria-label={`Select ${preset.name}`}
      >
        <input
          type="checkbox"
          checked={selectedPresetIds.has(preset.id)}
          onChange={() => onTogglePresetSelect(preset.id)}
        />
        <span className="sidebar-checkbox-visual" />
      </label>
      <div className="sidebar-item-content">
        {isEditing ? (
          <input
            ref={inputRef}
            className="sidebar-item-name-input"
            value={displayName}
            onChange={e => handleDraftChange(e.target.value)}
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
        <button
          className={`sidebar-star${preset.isPinned ? ' is-pinned' : ''}`}
          onClick={e => { e.stopPropagation(); void updatePreset(preset.id, { isPinned: !preset.isPinned }) }}
          title={preset.isPinned ? 'Unpin preset' : 'Pin preset'}
          aria-label={preset.isPinned ? 'Unpin preset' : 'Pin preset'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={preset.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </div>
      <button
        className="sidebar-item-close"
        onClick={handleDelete}
        title="Delete preset"
        aria-label={`Delete ${preset.name}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </li>
  )
}
