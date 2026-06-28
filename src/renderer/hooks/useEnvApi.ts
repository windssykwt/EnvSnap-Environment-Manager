import { useEffect, useRef } from 'react'

function getEnvApi(): Window['envApi'] | null {
  return window.envApi ?? null
}

export function useEnvApi(): Window['envApi'] | null {
  return getEnvApi()
}

export { getEnvApi }

export function usePresetActivated(callback: (presetId: string) => void): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const api = getEnvApi()
    if (!api?.onPresetActivated) return
    const unsubscribe = api.onPresetActivated((presetId: string) => {
      callbackRef.current(presetId)
    })
    return unsubscribe
  }, [])
}
