import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialogA11y } from '@/lib/useDialogA11y.js'

/**
 * Generic modal dialog: a dimmed backdrop behind a labelled box, portaled to
 * document.body so it can never be visually clipped by a scrolling/overflow
 * ancestor (the admin table rows ConfirmDelete lives in, in particular).
 *
 * Task 29, client feedback: replaces two separate hand-rolled confirmation
 * surfaces (the admin nav's inline unsaved-changes prompt and
 * ConfirmDelete's inline row prompt) with one primitive, so there is one
 * place, not two-going-on-three, that has to get focus trapping, focus
 * restore, Escape and backdrop-click right (see useDialogA11y.js).
 *
 * Escape and a backdrop click both cancel -- never confirm. `initialFocusRef`
 * is the caller's choice of where focus starts; every caller with a
 * destructive action alongside a safe one puts it on the safe one, so a
 * stray Enter right after the dialog opens can't discard anything.
 */
export function Modal({ titleId, onCancel, initialFocusRef, className = '', children }) {
  const containerRef = useRef(null)
  useDialogA11y({ containerRef, onCancel, initialFocusRef })

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}>
      <div
        ref={containerRef}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
