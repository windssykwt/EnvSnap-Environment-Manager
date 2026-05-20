import { useAppStore } from '../store'

export function ConfirmDialog() {
  const confirmDialog = useAppStore(s => s.confirmDialog)
  const closeConfirm = useAppStore(s => s.closeConfirm)

  if (!confirmDialog?.open) return null

  return (
    <div className="modal-overlay" onClick={closeConfirm}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{confirmDialog.title}</h3>
        <p>{confirmDialog.message}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={closeConfirm}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              confirmDialog.onConfirm()
              closeConfirm()
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
