import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent, DragEvent } from 'react'
import type { Preset } from '../../shared/types'
import { useAppStore } from '../store'
import { useSidebarResize } from '../hooks/useSidebarResize'
import { useSidebarDragDrop } from '../hooks/useSidebarDragDrop'
import { SidebarFolderSection } from './SidebarFolderSection'

/** Storage key for folder collapse state. */
const COLLAPSE_KEY = 'envchanger:collapsedFolders'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveCollapsed(names: string[]): void {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(names))
}

export function Sidebar() {
  // --- Shared store bindings ---
  const presets = useAppStore(s => s.presets)
  const selectedPresetId = useAppStore(s => s.selectedPresetId)
  const activePresetId = useAppStore(s => s.activePresetId)
  const folderNames = useAppStore(s => s.folderNames)
  const selectPreset = useAppStore(s => s.selectPreset)
  const createPreset = useAppStore(s => s.createPreset)
  const showToast = useAppStore(s => s.showToast)
  const addFolder = useAppStore(s => s.addFolder)
  const removeFolder = useAppStore(s => s.removeFolder)
  const renameFolderAction = useAppStore(s => s.renameFolder)
  const updatePreset = useAppStore(s => s.updatePreset)
  const showConfirm = useAppStore(s => s.showConfirm)

  // --- Local UI state ---
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(loadCollapsed)
  const [editingNewFolder, setEditingNewFolder] = useState(false)
  const [newFolderDraft, setNewFolderDraft] = useState('')
  const [folderContextMenu, setFolderContextMenu] = useState<{
    folderName: string
    x: number
    y: number
  } | null>(null)
  const newFolderInputRef = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // --- Preset selection for bulk operations ---
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(new Set())
  const deletePreset = useAppStore(s => s.deletePreset)

  const handleTogglePresetSelect = (id: string) => {
    setSelectedPresetIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = () => {
    if (selectedPresetIds.size === 0) return
    const count = selectedPresetIds.size
    showConfirm(
      'Delete Presets',
      `Delete ${count} preset${count === 1 ? '' : 's'}? They will move to History where you can restore them later.`,
      async () => {
        for (const id of selectedPresetIds) {
          await deletePreset(id)
        }
        setSelectedPresetIds(new Set())
        showToast(`${count} preset${count === 1 ? '' : 's'} moved to history`, 'success')
      },
      { destructive: true, confirmLabel: `Delete ${count}` },
    )
  }

  // --- Extracted hooks ---
  const { sidebarWidth, resizeRef } = useSidebarResize()

  const {
    dragOverFolder,
    dragOverFolderItems,
    draggingId,
    dragReorder,
    setDragOverFolder,
    setDragOverFolderItems,
    handlePresetDragStart,
    handlePresetDragEnd,
    handleFolderDragOver,
    handleFolderDrop,
    handleFolderItemsDragOver,
    handleFolderItemsDrop,
    handlePresetDragOver,
    handlePresetDragLeave,
    handlePresetReorderDrop,
  } = useSidebarDragDrop(presets)

  // --- Derived: group presets by folder, sorted by position ---
  const groupedPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const all = q ? presets.filter(p => p.name.toLowerCase().includes(q)) : presets

    const pinned: Preset[] = []
    const groups = new Map<string, Preset[]>()
    const ungrouped: Preset[] = []

    for (const p of all) {
      if (p.isPinned) {
        pinned.push(p)
        continue
      }
      const grp = p.group || ''
      if (!grp) {
        ungrouped.push(p)
      } else {
        if (!groups.has(grp)) groups.set(grp, [])
        groups.get(grp)!.push(p)
      }
    }

    pinned.sort((a, b) => a.position - b.position)
    for (const [, list] of groups) {
      list.sort((a, b) => a.position - b.position)
    }
    ungrouped.sort((a, b) => a.position - b.position)

    for (const fn of folderNames) {
      if (!groups.has(fn)) groups.set(fn, [])
    }

    const known = new Set(folderNames)
    const sorted: [string, Preset[]][] = []
    for (const fn of folderNames) {
      if (groups.has(fn)) {
        sorted.push([fn, groups.get(fn)!])
        groups.delete(fn)
      }
    }
    const remaining = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    sorted.push(...remaining)
    return { pinned, groups: sorted, ungrouped }
  }, [presets, searchQuery, folderNames])

  // --- Folder collapse ---
  const toggleCollapse = useCallback((name: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      saveCollapsed([...next])
      return next
    })
  }, [])

  // --- New folder ---
  const handleStartNewFolder = () => {
    setEditingNewFolder(true)
    setNewFolderDraft('')
    queueMicrotask(() => newFolderInputRef.current?.focus())
  }

  const handleCommitNewFolder = () => {
    const name = newFolderDraft.trim()
    if (name) {
      addFolder(name)
      showToast(`Folder "${name}" created`, 'success')
    }
    setEditingNewFolder(false)
    setNewFolderDraft('')
  }

  // --- New preset ---
  const handleNewPreset = async (group?: string) => {
    const name = `Preset ${presets.length + 1}`
    const preset = await createPreset(name, group)
    if (preset) {
      selectPreset(preset.id)
      setSearchQuery('')
    }
  }

  // --- Folder context menu ---
  const handleFolderContextMenu = useCallback((e: MouseEvent, folderName: string) => {
    e.preventDefault()
    e.stopPropagation()
    setFolderContextMenu({ folderName, x: e.clientX, y: e.clientY })
  }, [])

  const handleContextMenuRename = () => {
    if (!folderContextMenu) return
    const fn = folderContextMenu.folderName
    setFolderContextMenu(null)
    // Use the native prompt for folder rename
    const newName = window.prompt('Rename folder to:', fn)
    if (newName && newName.trim() && newName.trim() !== fn) {
      const trimmed = newName.trim()
      renameFolderAction(fn, trimmed)
      for (const p of presets) {
        if (p.group === fn) {
          void updatePreset(p.id, { group: trimmed })
        }
      }
      showToast(`Folder renamed to "${trimmed}"`, 'success')
    }
  }

  const handleContextMenuDelete = () => {
    if (!folderContextMenu) return
    const fn = folderContextMenu.folderName
    setFolderContextMenu(null)
    const folderPresets = presets.filter(p => p.group === fn)
    const count = folderPresets.length
    const warning = count > 0 ? ` ${count} preset${count === 1 ? '' : 's'} will be moved to Ungrouped.` : ''
    showConfirm(
      'Delete Folder',
      `Delete folder "${fn}"?${warning}`,
      async () => {
        for (const p of folderPresets) {
          await updatePreset(p.id, { group: '' })
        }
        removeFolder(fn)
        showToast(`Folder "${fn}" deleted`, 'info')
      },
      { destructive: true, confirmLabel: 'Delete Folder' },
    )
  }

  const handleContextMenuNewPreset = () => {
    if (!folderContextMenu) return
    const fn = folderContextMenu.folderName
    setFolderContextMenu(null)
    void handleNewPreset(fn === '__ungrouped__' ? undefined : fn)
  }

  // Close context menu on outside click / keydown
  useEffect(() => {
    if (!folderContextMenu) return
    const closeOnClick = (e: globalThis.MouseEvent) => {
      const menu = document.querySelector('.sidebar-context-menu')
      if (menu && menu.contains(e.target as Node)) return
      setFolderContextMenu(null)
    }
    const closeOnKey = () => setFolderContextMenu(null)
    window.addEventListener('click', closeOnClick)
    window.addEventListener('keydown', closeOnKey)
    return () => {
      window.removeEventListener('click', closeOnClick)
      window.removeEventListener('keydown', closeOnKey)
    }
  }, [folderContextMenu])

  // --- Shared drag handlers for ungrouped section ---
  const handleUngroupedDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    handleFolderDragOver(e, '__ungrouped__')
  }, [handleFolderDragOver])

  const handleUngroupedDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    handleFolderDrop('__ungrouped__', e)
  }, [handleFolderDrop])

  const handleUngroupedItemsDragOver = useCallback((e: DragEvent<HTMLUListElement>) => {
    handleFolderItemsDragOver(e, '__ungrouped__')
  }, [handleFolderItemsDragOver])

  const handleUngroupedItemsDrop = useCallback((e: DragEvent<HTMLUListElement>) => {
    handleFolderItemsDrop('__ungrouped__', e)
  }, [handleFolderItemsDrop])

  // --- Main render ---
  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-actions">
          <button className="btn-create-large" onClick={() => handleNewPreset()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create New
          </button>
          <button className="btn-create-large btn-create-folder" onClick={handleStartNewFolder} title="New Folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            New Folder
          </button>
        </div>
        {editingNewFolder && (
          <div className="sidebar-new-folder-form">
            <input
              ref={newFolderInputRef}
              className="sidebar-new-folder-input"
              placeholder="Folder name"
              value={newFolderDraft}
              onChange={e => setNewFolderDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleCommitNewFolder() }
                else if (e.key === 'Escape') { e.preventDefault(); setEditingNewFolder(false) }
              }}
              onBlur={handleCommitNewFolder}
              aria-label="New folder name"
            />
          </div>
        )}
        {presets.length > 5 && (
          <div className="sidebar-search">
            <svg className="sidebar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              className="sidebar-search-input"
              type="text"
              placeholder="Search presets…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search presets"
            />
            {searchQuery && (
              <button
                className="sidebar-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedPresetIds.size > 0 && (
        <div className="sidebar-bulk-bar">
          <span className="sidebar-bulk-count">{selectedPresetIds.size} selected</span>
          <div className="sidebar-bulk-actions">
            <button className="sidebar-bulk-clear" onClick={() => setSelectedPresetIds(new Set())}>
              Clear
            </button>
            <button className="btn btn-sm btn-destructive" onClick={handleBulkDelete}>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Preset list */}
      <ul className="sidebar-list">
        {presets.length === 0 && (
          <li className="sidebar-empty">No presets yet. Create one to get started.</li>
        )}
        {groupedPresets.ungrouped.length === 0 && groupedPresets.groups.length === 0 && presets.length > 0 && searchQuery && (
          <li className="sidebar-empty">No presets match "{searchQuery}"</li>
        )}

        {/* Pinned section */}
        {groupedPresets.pinned.length > 0 && (
          <div className="sidebar-folder-section">
            <div className="sidebar-folder-header" style={{ cursor: 'default' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color: '#e8b931' }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span className="sidebar-folder-name">Pinned</span>
            </div>
            <ul className="sidebar-folder-items">
              {groupedPresets.pinned.map(preset => (
                <SimplePresetItem
                  key={preset.id}
                  preset={preset}
                  isSelected={selectedPresetId === preset.id}
                  isActive={activePresetId === preset.id}
                  onSelect={() => selectPreset(preset.id)}
                  isSelectedForBulk={selectedPresetIds.has(preset.id)}
                  onTogglePresetSelect={handleTogglePresetSelect}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Folder sections */}
        {groupedPresets.groups.map(([folderName, folderPresets]) => (
          <SidebarFolderSection
            key={folderName}
            folderName={folderName}
            folderPresets={folderPresets}
            collapsedFolders={collapsedFolders}
            toggleCollapse={toggleCollapse}
            dragOverFolder={dragOverFolder}
            dragOverFolderItems={dragOverFolderItems}
            draggingId={draggingId}
            dragReorder={dragReorder}
            setDragOverFolder={setDragOverFolder}
            setDragOverFolderItems={setDragOverFolderItems}
            onFolderDragOver={handleFolderDragOver}
            onFolderDrop={handleFolderDrop}
            onFolderItemsDragOver={handleFolderItemsDragOver}
            onFolderItemsDrop={handleFolderItemsDrop}
            onPresetDragStart={handlePresetDragStart}
            onPresetDragEnd={handlePresetDragEnd}
            onPresetDragOver={handlePresetDragOver}
            onPresetDragLeave={handlePresetDragLeave}
            onPresetReorderDrop={handlePresetReorderDrop}
            onFolderContextMenu={handleFolderContextMenu}
            selectedPresetIds={selectedPresetIds}
            onTogglePresetSelect={handleTogglePresetSelect}
          />
        ))}

        {/* Ungrouped section */}
        {groupedPresets.ungrouped.length > 0 && (
          <div className="sidebar-folder-section">
            <div
              className={`sidebar-folder-header${collapsedFolders.has('__ungrouped__') ? ' collapsed' : ''}${dragOverFolder === '__ungrouped__' ? ' is-drag-over' : ''}`}
              onClick={() => toggleCollapse('__ungrouped__')}
              onContextMenu={e => handleFolderContextMenu(e, '__ungrouped__')}
              onDragOver={handleUngroupedDragOver}
              onDragEnter={() => setDragOverFolder('__ungrouped__')}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={handleUngroupedDrop}
            >
              <svg
                className="sidebar-folder-chevron"
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="sidebar-folder-name-ungrouped">Ungrouped</span>
              <span className="sidebar-folder-count">{groupedPresets.ungrouped.reduce((sum, p) => sum + p.variables.length, 0)}</span>
            </div>
            {!collapsedFolders.has('__ungrouped__') && (
              <ul
                className={`sidebar-folder-items${dragOverFolderItems === '__ungrouped__' ? ' is-drag-over' : ''}`}
                onDragOver={handleUngroupedItemsDragOver}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverFolderItems(null)
                  }
                }}
                onDrop={handleUngroupedItemsDrop}
              >
                {groupedPresets.ungrouped.map(preset => (
                  <SimplePresetItem
                    key={preset.id}
                    preset={preset}
                    isSelected={selectedPresetId === preset.id}
                    isActive={activePresetId === preset.id}
                    onSelect={() => selectPreset(preset.id)}
                    isSelectedForBulk={selectedPresetIds.has(preset.id)}
                    onTogglePresetSelect={handleTogglePresetSelect}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </ul>

      {/* Folder context menu — portaled to body */}
      {folderContextMenu && createPortal(
        <div
          className="sidebar-context-menu"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={handleContextMenuNewPreset}>New Preset</button>
          {folderContextMenu.folderName !== '__ungrouped__' && (
            <>
              <button onClick={handleContextMenuRename}>Rename Folder</button>
              <button className="sidebar-context-danger" onClick={handleContextMenuDelete}>Delete Folder</button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Resize handle */}
      <div className="sidebar-resize-handle" ref={resizeRef} />
    </aside>
  )
}

/**
 * Minimal preset item for the pinned section and ungrouped list
 * where drag-and-drop and inline rename are not needed.
 */
function SimplePresetItem({
  preset,
  isSelected,
  isActive,
  onSelect,
  isSelectedForBulk,
  onTogglePresetSelect,
}: {
  preset: Preset
  isSelected: boolean
  isActive: boolean
  onSelect: () => void
  isSelectedForBulk: boolean
  onTogglePresetSelect: (id: string) => void
}) {
  const updatePreset = useAppStore(s => s.updatePreset)
  const deletePreset = useAppStore(s => s.deletePreset)
  const showConfirm = useAppStore(s => s.showConfirm)
  const showToast = useAppStore(s => s.showToast)

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation()
    const warning = isActive ? ' Its variables will be removed from Windows.' : ''
    showConfirm(
      'Delete Preset',
      `Delete "${preset.name}"?${warning} It will move to History where you can restore it later.`,
      async () => {
        const success = await deletePreset(preset.id)
        if (success) showToast('Preset moved to history', 'success')
      },
      { destructive: true, confirmLabel: 'Delete' },
    )
  }

  const classes = [
    'sidebar-item',
    isSelected ? 'selected' : '',
    isActive ? 'active' : '',
  ].filter(Boolean).join(' ')

  return (
    <li className={classes} onClick={onSelect}>
      {isActive && (
        <span className="sidebar-active-badge" title="Currently active in Windows">
          <span className="sidebar-active-badge-dot" />
        </span>
      )}
      <label
        className={`sidebar-checkbox${isSelectedForBulk ? ' is-checked' : ''}`}
        onClick={e => e.stopPropagation()}
        aria-label={`Select ${preset.name}`}
      >
        <input
          type="checkbox"
          checked={isSelectedForBulk}
          onChange={() => onTogglePresetSelect(preset.id)}
        />
        <span className="sidebar-checkbox-visual" />
      </label>
      <div className="sidebar-item-content">
        <span className="sidebar-item-name">{preset.name}</span>
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
