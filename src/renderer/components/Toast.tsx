import { useAppStore } from '../store'

export function Toast() {
  const toast = useAppStore(s => s.toast)
  const clearToast = useAppStore(s => s.clearToast)

  if (!toast) return null

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (toast.onUndo) {
      toast.onUndo()
    }
    clearToast()
  }

  return (
    <div className={`toast toast-${toast.type}`} onClick={clearToast}>
      <span className="toast-message">{toast.message}</span>
      {toast.onUndo && (
        <button className="toast-undo-btn" onClick={handleUndo}>
          Undo
        </button>
      )}
    </div>
  )
}
