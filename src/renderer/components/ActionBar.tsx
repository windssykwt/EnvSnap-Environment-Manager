import { useAppStore } from '../store'

interface ActionBarProps {
  presetId: string
  onPersist: () => Promise<boolean>
  hasInvalidKeys: boolean
}

export function ActionBar({ presetId, onPersist, hasInvalidKeys }: ActionBarProps) {
  const presets = useAppStore(s => s.presets)
  const activePresetId = useAppStore(s => s.activePresetId)
  const deletePreset = useAppStore(s => s.deletePreset)
  const duplicatePreset = useAppStore(s => s.duplicatePreset)
  const activatePreset = useAppStore(s => s.activatePreset)
  const deactivatePreset = useAppStore(s => s.deactivatePreset)
  const selectPreset = useAppStore(s => s.selectPreset)
  const showConfirm = useAppStore(s => s.showConfirm)
  const showToast = useAppStore(s => s.showToast)
  const settings = useAppStore(s => s.settings)
  const isLoading = useAppStore(s => s.isLoading)

  const preset = presets.find(p => p.id === presetId)
  if (!preset) return null

  const isActive = activePresetId === presetId

  const handleActivate = async () => {
    const doActivate = async () => {
      const saved = await onPersist()
      if (!saved) return
      const result = await activatePreset(presetId)
      if (result?.success) {
        showToast(`Preset "${preset.name}" applied to Windows`, 'success')
      } else {
        showToast(result?.error?.message ?? 'Failed to activate preset', 'error')
      }
    }

    if (settings.confirmBeforeApply) {
      showConfirm(
        'Activate Preset',
        `Apply "${preset.name}" to Windows User Environment Variables? Existing values for these variables will be overwritten.`,
        doActivate,
      )
    } else {
      await doActivate()
    }
  }

  const handleDeactivate = () => {
    showConfirm(
      'Deactivate Preset',
      `Remove the variables defined by "${preset.name}" from Windows User Environment Variables? The preset itself will stay in your list.`,
      async () => {
        const result = await deactivatePreset()
        if (result?.success) {
          showToast(`Preset "${preset.name}" deactivated`, 'success')
        } else {
          showToast(result?.error?.message ?? 'Failed to deactivate preset', 'error')
        }
      },
    )
  }

  const handleDuplicate = async () => {
    const newPreset = await duplicatePreset(presetId)
    if (newPreset) {
      selectPreset(newPreset.id)
      showToast('Preset duplicated', 'success')
    } else {
      showToast('Failed to duplicate preset', 'error')
    }
  }

  const handleDelete = () => {
    const warning = isActive
      ? ` Its variables will be removed from Windows.`
      : ''
    showConfirm(
      'Delete Preset',
      `Delete "${preset.name}"?${warning} It will move to History where you can restore it later.`,
      async () => {
        const deletedName = preset.name
        const success = await deletePreset(presetId)
        if (success) {
          // Load backups so we can find the one we just created for undo
          const store = useAppStore.getState()
          await store.loadBackups()
          const backups = store.backups
          // The most recent preset-archive backup with this name is our undo target
          const undoBackup = backups.find(
            b => b.kind === 'preset-archive' && b.presetName === deletedName
          )
          showToast('Preset moved to history', 'success', {
            onUndo: undoBackup
              ? async () => {
                  const restored = await store.restoreBackup(undoBackup.id)
                  if (restored) {
                    store.selectPreset(restored.id)
                    store.showToast(`"${deletedName}" restored`, 'success')
                  }
                }
              : undefined,
          })
        }
      },
      { destructive: true, confirmLabel: 'Delete' },
    )
  }

  return (
    <div className="action-bar">
      <div className="action-bar-primary">
        {isActive ? (
          <button
            className="btn btn-deactivate"
            onClick={handleDeactivate}
            disabled={isLoading}
          >
            <span className="btn-icon" aria-hidden="true">⏻</span>
            Deactivate
          </button>
        ) : (
          <button
            className="btn btn-activate"
            onClick={handleActivate}
            disabled={isLoading || hasInvalidKeys}
            title={hasInvalidKeys ? 'Fix invalid variable names first' : 'Apply this preset to Windows'}
          >
            <span className="btn-icon" aria-hidden="true">▶</span>
            Activate
          </button>
        )}
      </div>
      <div className="action-bar-secondary">
        <button className="btn btn-secondary" onClick={handleDuplicate}>Duplicate</button>
        <button className="btn btn-danger-outline" onClick={handleDelete}>Delete</button>
      </div>
    </div>
  )
}
