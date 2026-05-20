import type { Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/constants'
import { mutateData, readDataFile } from './index'

export function getSettings(): Settings {
  const data = readDataFile()
  return { ...DEFAULT_SETTINGS, ...data.settings }
}

export function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  return mutateData(data => {
    const merged: Settings = { ...DEFAULT_SETTINGS, ...data.settings, ...partial }
    return { next: { ...data, settings: merged }, result: merged }
  })
}
