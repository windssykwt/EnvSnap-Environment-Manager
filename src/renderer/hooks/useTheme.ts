import { useEffect } from 'react'
import { useAppStore } from '../store'
import type { ThemeMode } from '../../shared/types'

function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  // System: check OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): void {
  const theme = useAppStore(s => s.settings.theme)

  useEffect(() => {
    const apply = () => {
      const effective = getEffectiveTheme(theme)
      document.documentElement.setAttribute('data-theme', effective)
    }

    apply()

    // Listen for OS theme changes when mode is 'system'
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => apply()
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])
}
