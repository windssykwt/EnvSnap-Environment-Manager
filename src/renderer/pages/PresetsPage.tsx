import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store'
import { Sidebar } from '../components/Sidebar'
import { VariableTable } from '../components/VariableTable'
import type { Variable } from '../../shared/types'
import { isValidEnvKey } from '../lib/validation'
import { ActionBar } from '../components/ActionBar'

const AUTO_SAVE_DELAY = 600

export function PresetsPage() {
  const presets = useAppStore(s => s.presets)
  const selectedPresetId = useAppStore(s => s.selectedPresetId)
  const activePresetId = useAppStore(s => s.activePresetId)
  const loadPresets = useAppStore(s => s.loadPresets)
  const updatePreset = useAppStore(s => s.updatePreset)
  const showToast = useAppStore(s => s.showToast)

  const initial = presets.find(p => p.id === selectedPresetId)
  const [localVariables, setLocalVariables] = useState<Variable[]>(initial?.variables ?? [])
  const [presetName, setPresetName] = useState(initial?.name ?? '')

  const [isDirty, setIsDirty] = useState(false)
  const loadedPresetIdRef = useRef<string | null>(selectedPresetId)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs to always have latest values in the auto-save callback
  const presetNameRef = useRef(presetName)
  const localVariablesRef = useRef(localVariables)
  const selectedPresetIdRef = useRef(selectedPresetId)
  presetNameRef.current = presetName
  localVariablesRef.current = localVariables
  selectedPresetIdRef.current = selectedPresetId

  useEffect(() => {
    loadPresets()
  }, [])

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  // Auto-save: debounced persist whenever dirty flag is set
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(async () => {
      const id = selectedPresetIdRef.current
      if (!id) return
      const result = await updatePreset(id, {
        name: presetNameRef.current,
        variables: localVariablesRef.current,
      })
      if (result) {
        setIsDirty(false)
      }
    }, AUTO_SAVE_DELAY)
  }, [updatePreset])

  useEffect(() => {
    if (selectedPresetId === loadedPresetIdRef.current && isDirty) {
      return
    }
    const preset = presets.find(p => p.id === selectedPresetId)
    if (preset) {
      setLocalVariables(preset.variables.map(v => ({ ...v })))
      setPresetName(preset.name)
    } else {
      setLocalVariables([])
      setPresetName('')
    }
    loadedPresetIdRef.current = selectedPresetId
    setIsDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPresetId])

  useEffect(() => {
    if (selectedPresetId && !presets.find(p => p.id === selectedPresetId)) {
      setLocalVariables([])
      setPresetName('')
      setIsDirty(false)
      loadedPresetIdRef.current = null
    }
  }, [presets, selectedPresetId])

  const selectedPreset = presets.find(p => p.id === selectedPresetId)
  const isActive = selectedPresetId !== null && activePresetId === selectedPresetId

  const handleNameChange = (name: string) => {
    setPresetName(name)
    setIsDirty(true)
    scheduleAutoSave()
  }

  const handleVariablesChange = (vars: Variable[]) => {
    setLocalVariables(vars)
    setIsDirty(true)
    scheduleAutoSave()
  }

  const persistPreset = async (): Promise<boolean> => {
    if (!selectedPresetId) return false
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    const result = await updatePreset(selectedPresetId, { name: presetName, variables: localVariables })
    if (result) {
      setIsDirty(false)
    }
    return Boolean(result)
  }

  const handleExportThis = async () => {
    if (!selectedPresetId) return
    const api = (window as any).envApi
    if (!api?.importExport?.exportOne) return
    // Persist any in-flight edits first so the file matches what's on screen.
    await persistPreset()
    const result = await api.importExport.exportOne(selectedPresetId)
    if (result.success) {
      if (result.data) {
        showToast(`Preset "${presetName}" exported`, 'success')
      }
    } else {
      showToast(result.error?.message ?? 'Failed to export preset', 'error')
    }
  }

  const handleImportMerge = async () => {
    if (!selectedPresetId) return
    const api = (window as any).envApi
    if (!api?.importExport?.importMerge) return
    // Save current edits before merging so they aren't lost when we reload.
    await persistPreset()
    const result = await api.importExport.importMerge(selectedPresetId)
    if (result.success) {
      const { added = 0, updated = 0 } = result.data ?? {}
      if (added === 0 && updated === 0) {
        showToast('No changes — file produced no new or updated variables', 'info')
      } else {
        const parts: string[] = []
        if (added) parts.push(`${added} added`)
        if (updated) parts.push(`${updated} updated`)
        showToast(`Merged into "${presetName}" (${parts.join(', ')})`, 'success')
      }
      // Force a reload of the editor from the freshly merged preset.
      loadedPresetIdRef.current = null
      setIsDirty(false)
      await loadPresets()
    } else {
      showToast(result.error?.message ?? 'Failed to import variables', 'error')
    }
  }

  return (
    <div className="app-content">
      <Sidebar />
      <main className="main-content-area">
        {selectedPreset ? (
          <>
            <div className="preset-title-section">
              <span className="preset-label">Name:</span>
              <input
                className="preset-name-input"
                type="text"
                value={presetName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Preset name"
              />
              <div className="preset-title-actions">
                <button
                  type="button"
                  className="btn-icon-action"
                  onClick={handleImportMerge}
                  title="Import variables from a file and merge into this preset"
                  aria-label="Import into this preset"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-icon-action"
                  onClick={handleExportThis}
                  title="Export this preset to a JSON file"
                  aria-label="Export this preset"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              </div>
              <span
                className={`save-indicator${isDirty ? ' is-dirty' : ' is-saved'}`}
                title={isDirty ? 'Unsaved changes' : 'All changes saved'}
                aria-label={isDirty ? 'Unsaved changes' : 'All changes saved'}
              />
              {isActive && (
                <span className="active-pill" title="This preset is currently applied to Windows">
                  <span className="active-pill-dot" aria-hidden="true" />
                  Active
                </span>
              )}
            </div>
            <VariableTable
              variables={localVariables}
              onChange={handleVariablesChange}
            />
            <ActionBar
              presetId={selectedPresetId!}
              onPersist={persistPreset}
              hasInvalidKeys={localVariables.some(v => !isValidEnvKey(v.key))}
            />
          </>
        ) : (
          <div className="empty-state" style={{ textAlign: 'center', opacity: 0.5 }}>
            <p>Select or create a preset to get started</p>
          </div>
        )}
      </main>
    </div>
  )
}
