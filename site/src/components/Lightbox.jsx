import { useCallback, useEffect, useRef, useState } from 'react'
import { useDialogA11y } from '@/lib/useDialogA11y.js'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

/**
 * Task 29, client feedback (a whole-branch review flagged this): `role=
 * "dialog" aria-modal="true"` below is a claim about behaviour, and until
 * now none of it was actually implemented -- no focus trap, no focus
 * restore, no click-outside close. useDialogA11y (shared with Modal.jsx,
 * the admin's confirmation dialogs) is what makes the claim true: focus
 * moves into the lightbox on open, is trapped inside it while open, and is
 * restored to whatever opened it once it closes. Escape now closes via that
 * same shared handling rather than a second, separate keydown listener; the
 * arrow-key image navigation below is unrelated to dialog semantics and
 * stays its own listener.
 */
export function Lightbox({ images = [], index = 0, onClose }) {
  const [current, setCurrent] = useState(index)
  const containerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const move = useCallback(
    (delta) => setCurrent((c) => (c + delta + images.length) % images.length),
    [images.length]
  )

  useDialogA11y({ containerRef, onCancel: onClose, initialFocusRef: closeButtonRef })

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  const image = images[current]
  // Task 38, part 6 (client feedback: "we shouldnt have arrows if theres a
  // single iamge"). `move` wraps modulo images.length, so on a one-image
  // gallery both arrows were live controls that did nothing observable --
  // worse than absent, since a control that visibly does nothing reads as
  // broken. The close button is unaffected, so the dialog still has
  // something to hold initial focus and keep the focus trap non-empty.
  const hasMultiple = images.length > 1
  return (
    <div
      className="lightbox"
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      // A click anywhere in the lightbox that isn't the image or a control
      // closes it, the same "click outside the actual content" contract as
      // Modal.jsx's backdrop -- there's no separate backdrop element here,
      // so it's the container's own background that plays that role.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <button ref={closeButtonRef} type="button" className="lightbox-close" onClick={onClose} aria-label="Fermer">×</button>
      {hasMultiple && (
        <button type="button" className="lightbox-prev" onClick={() => move(-1)} aria-label="Précédent">‹</button>
      )}
      <img src={src(image?.variants?.large || image?.variants?.medium)} alt={image?.alt || ''} />
      {hasMultiple && (
        <button type="button" className="lightbox-next" onClick={() => move(1)} aria-label="Suivant">›</button>
      )}
    </div>
  )
}
