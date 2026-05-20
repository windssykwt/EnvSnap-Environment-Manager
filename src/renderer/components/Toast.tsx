import { useAppStore } from '../store'

export function Toast() {
  const toast = useAppStore(s => s.toast)
  const clearToast = useAppStore(s => s.clearToast)

  if (!toast) return null

  return (
    <div className={`toast toast-${toast.type}`} onClick={clearToast}>
      {toast.message}
    </div>
  )
}
