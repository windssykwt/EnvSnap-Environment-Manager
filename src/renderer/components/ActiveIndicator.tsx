import { useAppStore } from '../store'

export function ActiveIndicator() {
  const activePresetId = useAppStore(s => s.activePresetId)
  const presets = useAppStore(s => s.presets)

  const activePreset = presets.find(p => p.id === activePresetId)

  if (!activePreset) return null

  return (
    <div className="active-indicator">
      Active: <strong>{activePreset.name}</strong>
    </div>
  )
}
