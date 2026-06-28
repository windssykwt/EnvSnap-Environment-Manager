import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'

export function ConfirmDialog() {
  const confirmDialog = useAppStore(s => s.confirmDialog)
  const closeConfirm = useAppStore(s => s.closeConfirm)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Auto-focus the Cancel button when dialog opens (safety for destructive actions)
  useEffect(() => {
    if (confirmDialog?.open && cancelRef.current) {
      cancelRef.current.focus()
    }
  }, [confirmDialog?.open])

  if (!confirmDialog?.open) return null

  const isDestructive = confirmDialog.destructive ?? false
  const confirmLabel = confirmDialog.confirmLabel ?? 'Confirm'

  const handleConfirm = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await confirmDialog.onConfirm()
    } finally {
      setIsProcessing(false)
      closeConfirm()
    }
  }

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
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            className={`btn ${isDestructive ? 'btn-destructive' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
