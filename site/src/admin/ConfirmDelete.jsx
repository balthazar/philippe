import { useState } from 'react'

/**
 * An in-page delete confirmation, never a browser confirm() dialog (task 25,
 * client feedback item 3): the first click swaps the button for an inline
 * prompt naming what's about to be destroyed, plus "Confirmer" / "Annuler".
 * Only the second click, on "Confirmer", actually deletes anything.
 */
export function ConfirmDelete({ label, onConfirm, busy = false }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button type="button" className="button-danger" onClick={() => setConfirming(true)}>
        Supprimer
      </button>
    )
  }

  return (
    <span className="confirm-delete" role="group" aria-label={`Confirmer la suppression : ${label}`}>
      <span className="confirm-delete-prompt">Supprimer « {label} » ?</span>
      <button type="button" className="button-danger" disabled={busy} onClick={onConfirm}>
        {busy ? 'Suppression…' : 'Confirmer'}
      </button>
      <button type="button" className="admin-row-button" disabled={busy} onClick={() => setConfirming(false)}>
        Annuler
      </button>
    </span>
  )
}
