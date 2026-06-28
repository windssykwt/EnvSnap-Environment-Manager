import { useState, useRef } from 'react'
import type { DragEvent } from 'react'
import type { Preset } from '../../shared/types'
import { useAppStore } from '../store'

interface DragReorderState {
  targetId: string
  position: 'before' | 'after'
}

/**
 * Consolidated drag-and-drop logic for sidebar preset and folder operations.
 */
export function useSidebarDragDrop(presets: Preset[]) {
  const updatePreset = useAppStore(s => s.updatePreset)
  const reorderPresets = useAppStore(s => s.reorderPresets)
  const showToast = useAppStore(s => s.showToast)

  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [dragOverFolderItems, setDragOverFolderItems] = useState<string | null>(null)
  const [dragReorder, setDragReorder] = useState<DragReorderState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggedPresetIdRef = useRef<string | null>(null)

  const handlePresetDragStart = (e: DragEvent<HTMLLIElement>, presetId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', presetId)
    draggedPresetIdRef.current = presetId
    setDraggingId(presetId)
  }

  const handlePresetDragEnd = () => {
    setDragOverFolder(null)
    setDragOverFolderItems(null)
    setDragReorder(null)
    setDraggingId(null)
    draggedPresetIdRef.current = null
  }

  const handleFolderDragOver = (e: DragEvent<HTMLDivElement>, folderName: string) => {
    const draggedId = draggedPresetIdRef.current
    if (draggedId) {
      const draggedPreset = presets.find(p => p.id === draggedId)
      const targetGroup = folderName === '__ungrouped__' ? '' : folderName
      if (draggedPreset && draggedPreset.group === targetGroup) return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleFolderDrop = async (folderName: string, e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOverFolder(null)
    const presetId = e.dataTransfer.getData('text/plain')
    if (!presetId) return
    const targetGroup = folderName === '__ungrouped__' ? '' : folderName
    const preset = presets.find(p => p.id === presetId)
    if (!preset || preset.group === targetGroup) return
    await updatePreset(presetId, { group: targetGroup })
    const groupPresets = presets
      .filter(p => p.group === targetGroup && p.id !== presetId)
      .sort((a, b) => a.position - b.position)
    const reorderItems = groupPresets.map((p, i) => ({ id: p.id, position: i }))
    reorderItems.push({ id: presetId, position: groupPresets.length })
    await reorderPresets(reorderItems)
    showToast(`Moved to ${folderName === '__ungrouped__' ? 'Ungrouped' : folderName}`, 'success')
  }

  const handleFolderItemsDragOver = (e: DragEvent<HTMLUListElement>, folderName: string) => {
    if (!draggedPresetIdRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderItems(folderName)
    setDragOverFolder(null)
  }

  const handleFolderItemsDrop = async (folderName: string, e: DragEvent<HTMLUListElement>) => {
    e.preventDefault()
    setDragOverFolderItems(null)
    const presetId = e.dataTransfer.getData('text/plain')
    if (!presetId) return
    const targetGroup = folderName === '__ungrouped__' ? '' : folderName
    const draggedPreset = presets.find(p => p.id === presetId)
    if (!draggedPreset) return

    const groupPresets = presets
      .filter(p => p.group === targetGroup && p.id !== presetId)
      .sort((a, b) => a.position - b.position)

    const reorderItems = groupPresets.map((p, i) => ({ id: p.id, position: i }))
    reorderItems.push({ id: presetId, position: groupPresets.length })

    if (draggedPreset.group !== targetGroup) {
      await updatePreset(presetId, { group: targetGroup })
    }
    await reorderPresets(reorderItems)
    showToast(`Moved to ${folderName === '__ungrouped__' ? 'Ungrouped' : folderName}`, 'success')
  }

  const handlePresetDragOver = (e: DragEvent<HTMLLIElement>, targetPreset: Preset) => {
    const draggedId = draggedPresetIdRef.current
    if (!draggedId || draggedId === targetPreset.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDragReorder({
      targetId: targetPreset.id,
      position: y < rect.height / 2 ? 'before' : 'after',
    })
  }

  const handlePresetDragLeave = (e: DragEvent<HTMLLIElement>, presetId: string) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragReorder(prev => prev?.targetId === presetId ? null : prev)
    }
  }

  const handlePresetReorderDrop = async (e: DragEvent<HTMLLIElement>, targetPreset: Preset) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('text/plain')
    if (!draggedId || draggedId === targetPreset.id) {
      setDragReorder(null)
      return
    }

    const draggedPreset = presets.find(p => p.id === draggedId)
    if (!draggedPreset) { setDragReorder(null); return }

    const targetGroup = targetPreset.group
    const isCrossGroup = draggedPreset.group !== targetGroup

    const groupPresets = presets
      .filter(p => p.group === targetGroup)
      .sort((a, b) => a.position - b.position)
    const filtered = groupPresets.filter(p => p.id !== draggedId)

    const targetIndex = filtered.findIndex(p => p.id === targetPreset.id)
    const insertAt = (dragReorder?.targetId === targetPreset.id && dragReorder.position === 'after')
      ? targetIndex + 1
      : targetIndex
    const clampedInsertAt = Math.max(0, Math.min(insertAt, filtered.length))
    filtered.splice(clampedInsertAt, 0, draggedPreset)

    const reorderItems = filtered.map((p, i) => ({ id: p.id, position: i }))

    setDragReorder(null)
    draggedPresetIdRef.current = null

    if (isCrossGroup) {
      await updatePreset(draggedId, { group: targetGroup })
    }
    await reorderPresets(reorderItems)
  }

  return {
    dragOverFolder,
    dragOverFolderItems,
    dragReorder,
    draggingId,
    draggedPresetIdRef,
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
  }
}
