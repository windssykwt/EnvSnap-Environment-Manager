import { useAppStore } from '../store'

export function useToast() {
  const showToast = useAppStore(s => s.showToast)
  const clearToast = useAppStore(s => s.clearToast)
  return { showToast, clearToast }
}
