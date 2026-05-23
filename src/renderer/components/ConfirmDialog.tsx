import { useEffect, useRef } from 'react'
import { useAppStore } from '../store'

export function ConfirmDialog() {
  const confirmDialog = useAppStore(s => s.confirmDialog)
  const closeConfirm = useAppStore(s => s.closeConfirm)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the Cancel button when dialog opens (safety for destructive actions)
  useEffect(() => {
    if (confirmDialog?.open && cancelRef.current) {
      cancelRef.current.focus()
    }
  }, [confirmDialog?.open])

  if (!confirmDialog?.open) return null

  const isDestructive = confirmDialog.destructive ?? false
  const confirmLabel = confirmDialog.confirmLabel ?? 'Confirm'

  return (
    <div className="modal-overlay" onClick={closeConfirm}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{confirmDialog.title}</h3>
        <p>{confirmDialog.message}</p>
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="btn btn-secondary"
            onClick={closeConfirm}
          >
            Cancel
          </button>
          <button
            className={`btn ${isDestructive ? 'btn-destructive' : 'btn-primary'}`}
            onClick={() => {
              confirmDialog.onConfirm()
              closeConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
