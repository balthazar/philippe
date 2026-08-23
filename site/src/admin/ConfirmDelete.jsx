import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal.jsx'

/**
 * A delete confirmation, never a browser confirm() dialog (task 25, client
 * feedback item 3): the first click swaps the button for a confirmation
 * naming what's about to be destroyed, plus "Confirmer" / "Annuler". Only
 * the second click, on "Confirmer", actually deletes anything.
 *
 * Task 29, client feedback: the confirmation is now the same Modal
 * primitive the admin nav's unsaved-changes warning uses (rather than a
 * second, differently-behaved inline prompt), so a destructive action gets
 * the same real backdrop, focus trap, focus restore, and Escape/backdrop
 * cancel -- initial focus goes to "Annuler", never "Confirmer", so a stray
 * Enter right after the confirmation opens can't delete anything.
 */
export function ConfirmDelete({ label, onConfirm, busy = false }) {
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef(null)

  if (!confirming) {
    return (
      <button type="button" className="button-danger" onClick={() => setConfirming(true)}>
        Supprimer
      </button>
    )
  }

  return (
    <Modal titleId="confirm-delete-title" onCancel={() => setConfirming(false)} initialFocusRef={cancelRef}>
      <h2 id="confirm-delete-title">Confirmer la suppression</h2>
      <p>Supprimer « {label} » ?</p>
      <div className="modal-actions">
        <button ref={cancelRef} type="button" className="admin-row-button" disabled={busy} onClick={() => setConfirming(false)}>
          Annuler
        </button>
        <button type="button" className="button-danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Suppression…' : 'Confirmer'}
        </button>
      </div>
    </Modal>
  )
}
