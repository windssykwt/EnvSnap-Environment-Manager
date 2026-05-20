import { useEffect, useRef } from 'react'

export function useEnvApi(): Window['envApi'] | null {
  return (window as any).envApi ?? null
}

export function usePresetActivated(callback: (presetId: string) => void): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const api = (window as any).envApi
    if (!api?.onPresetActivated) return
    const unsubscribe = api.onPresetActivated((presetId: string) => {
      callbackRef.current(presetId)
    })
    return unsubscribe
  }, [])
}
