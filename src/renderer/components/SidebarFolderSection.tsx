import { useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import type { Preset } from '../../shared/types'
import { useAppStore } from '../store'
import { SidebarPresetItem } from './SidebarPresetItem'

interface SidebarFolderSectionProps {
  folderName: string
  folderPresets: Preset[]
  collapsedFolders: Set<string>
  toggleCollapse: (name: string) => void
  dragOverFolder: string | null
  dragOverFolderItems: string | null
  draggingId: string | null
  dragReorder: { targetId: string; position: 'before' | 'after' } | null
  setDragOverFolder: (v: string | null) => void
  setDragOverFolderItems: (v: string | null) => void
  onFolderDragOver: (e: DragEvent<HTMLDivElement>, folderName: string) => void
  onFolderDrop: (folderName: string, e: DragEvent<HTMLDivElement>) => void
  onFolderItemsDragOver: (e: DragEvent<HTMLUListElement>, folderName: string) => void
  onFolderItemsDrop: (folderName: string, e: DragEvent<HTMLUListElement>) => void
  onPresetDragStart: (e: DragEvent<HTMLLIElement>, presetId: string) => void
  onPresetDragEnd: () => void
  onPresetDragOver: (e: DragEvent<HTMLLIElement>, preset: Preset) => void
  onPresetDragLeave: (e: DragEvent<HTMLLIElement>, presetId: string) => void
  onPresetReorderDrop: (e: DragEvent<HTMLLIElement>, preset: Preset) => void
  onFolderContextMenu: (e: MouseEvent, folderName: string) => void
  selectedPresetIds: Set<string>
  onTogglePresetSelect: (id: string) => void
}

export function SidebarFolderSection({
  folderName,
  folderPresets,
  collapsedFolders,
  toggleCollapse,
  dragOverFolder,
  dragOverFolderItems,
  draggingId,
  dragReorder,
  setDragOverFolder,
  setDragOverFolderItems,
  onFolderDragOver,
  onFolderDrop,
  onFolderItemsDragOver,
  onFolderItemsDrop,
  onPresetDragStart,
  onPresetDragEnd,
  onPresetDragOver,
  onPresetDragLeave,
  onPresetReorderDrop,
  onFolderContextMenu,
  selectedPresetIds,
  onTogglePresetSelect,
}: SidebarFolderSectionProps) {
  const folderNames = useAppStore(s => s.folderNames)
  const reorderFolders = useAppStore(s => s.reorderFolders)
  const selectedPresetId = useAppStore(s => s.selectedPresetId)
  const activePresetId = useAppStore(s => s.activePresetId)
  const showToast = useAppStore(s => s.showToast)
  const removeFolder = useAppStore(s => s.removeFolder)
  const updatePreset = useAppStore(s => s.updatePreset)
  const renameFolderAction = useAppStore(s => s.renameFolder)

  const [editingFolderName, setEditingFolderName] = useState<string | null>(null)
  const [editingFolderDraft, setEditingFolderDraft] = useState('')

  const isCollapsed = collapsedFolders.has(folderName)
  const isDragOver = dragOverFolder === folderName
  const isItemsDragOver = dragOverFolderItems === folderName
  const folderIdx = folderNames.indexOf(folderName)

  const totalVars = (list: Preset[]) => list.reduce((sum, p) => sum + p.variables.length, 0)

  // --- Folder rename ---
  const handleStartFolderRename = () => {
    setEditingFolderName(folderName)
    setEditingFolderDraft(folderName)
  }

  const handleCommitFolderRename = () => {
    if (editingFolderName === null) return
    const newName = editingFolderDraft.trim()
    if (newName && newName !== editingFolderName) {
      renameFolderAction(editingFolderName, newName)
      for (const p of folderPresets) {
        void updatePreset(p.id, { group: newName })
      }
      showToast(`Folder renamed to "${newName}"`, 'success')
    }
    setEditingFolderName(null)
  }

  // --- Folder delete ---
  const handleDeleteFolder = () => {
    const count = folderPresets.length
    showToast(`Folder "${folderName}" deleted`, 'info')
    for (const p of folderPresets) {
      void updatePreset(p.id, { group: '' })
    }
    removeFolder(folderName)
  }

  const handleContextMenu = (e: MouseEvent) => {
    onFolderContextMenu(e, folderName)
  }

  const headerClasses = [
    'sidebar-folder-header',
    isCollapsed ? 'collapsed' : '',
    isDragOver ? ' is-drag-over' : '',
  ].filter(Boolean).join(' ')

  return (
    <div key={folderName} className="sidebar-folder-section">
      <div
        className={headerClasses}
        onClick={() => toggleCollapse(folderName)}
        onContextMenu={handleContextMenu}
        onDragOver={e => onFolderDragOver(e, folderName)}
        onDragEnter={() => setDragOverFolder(folderName)}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={e => onFolderDrop(folderName, e)}
      >
        <svg className="sidebar-folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {editingFolderName === folderName ? (
          <input
            className="sidebar-folder-rename-input"
            value={editingFolderDraft}
            onChange={e => setEditingFolderDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleCommitFolderRename() }
              else if (e.key === 'Escape') { e.preventDefault(); setEditingFolderName(null) }
            }}
            onBlur={handleCommitFolderRename}
            aria-label="Folder name"
            autoFocus
          />
        ) : (
          <span className="sidebar-folder-name" onDoubleClick={e => { e.stopPropagation(); handleStartFolderRename() }}>{folderName}</span>
        )}
        {folderIdx !== -1 && (
          <>
            <button
              className="sidebar-folder-reorder"
              disabled={folderIdx === 0}
              onClick={e => { e.stopPropagation(); reorderFolders(folderIdx, folderIdx - 1) }}
              title="Move folder up"
              aria-label="Move folder up"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              className="sidebar-folder-reorder"
              disabled={folderIdx === folderNames.length - 1}
              onClick={e => { e.stopPropagation(); reorderFolders(folderIdx, folderIdx + 1) }}
              title="Move folder down"
              aria-label="Move folder down"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </>
        )}
        <button
          className="sidebar-folder-add"
          onClick={e => { e.stopPropagation(); handleNewPresetInFolder() }}
          title="New preset in this folder"
          aria-label="New preset in this folder"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span className="sidebar-folder-count">{totalVars(folderPresets)}</span>
      </div>
      {!isCollapsed && (
        <ul
          className={`sidebar-folder-items${isItemsDragOver ? ' is-drag-over' : ''}`}
          onDragOver={e => onFolderItemsDragOver(e, folderName)}
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOverFolderItems(null)
            }
          }}
          onDrop={e => onFolderItemsDrop(folderName, e)}
        >
          {folderPresets.length === 0 && (
            <li className="sidebar-folder-items-hint">Drop preset here</li>
          )}
          {folderPresets.map(preset => (
            <SidebarPresetItem
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              isActive={activePresetId === preset.id}
              isDragging={draggingId === preset.id}
              isDragTarget={dragReorder?.targetId === preset.id}
              dragPosition={dragReorder?.targetId === preset.id ? dragReorder.position : null}
              onDragStart={onPresetDragStart}
              onDragEnd={onPresetDragEnd}
              onDragOver={onPresetDragOver}
              onDragLeave={onPresetDragLeave}
              onDrop={onPresetReorderDrop}
              selectedPresetIds={selectedPresetIds}
              onTogglePresetSelect={onTogglePresetSelect}
            />
          ))}
        </ul>
      )}
    </div>
  )

  function handleNewPresetInFolder() {
    useAppStore.getState().createPreset(`Preset ${Date.now()}`, folderName).then(p => {
      if (p) useAppStore.getState().selectPreset(p.id)
    })
  }
}
