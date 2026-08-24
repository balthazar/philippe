import { useCallback, useEffect, useRef, useState } from 'react'
import { useDialogA11y } from '@/lib/useDialogA11y.js'
import { Chevron } from './Chevron.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

/**
 * Task 38, part 8 (client request: "a feature once in fullscreen mode, to
 * zoom in more onto an image, in order to see details of it").
 *
 * 2.5x, against the `large` variant the lightbox already loads -- 2400px on
 * its long edge (see api/src/lib/imagePipeline.js). On a typical display
 * that variant is being shown at roughly half its pixel dimensions, so this
 * is reading detail that is genuinely in the file rather than interpolating
 * it. Going much past this starts magnifying the resampling instead of the
 * photograph. The archival originals are deliberately unreachable over HTTP
 * (_originals/, see the media route), so they are not an option here and
 * should not become one.
 */
const ZOOM_SCALE = 2.5

const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

/**
 * Where in the image the pointer is, as a percentage of its own box -- fed
 * straight to `transform-origin`, so the point under the cursor is the point
 * that stays put as the image scales up around it.
 */
function originFromPointer(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  if (!rect.width || !rect.height) return { x: 50, y: 50 }
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
  }
}

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
  // Task 38, part 8: 1 (fit) or ZOOM_SCALE. Not a continuous range -- the
  // client asked to see detail, not to operate a zoom control, and one
  // click each way is the whole interaction.
  const [zoom, setZoom] = useState(1)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const containerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const move = useCallback(
    (delta) => setCurrent((c) => (c + delta + images.length) % images.length),
    [images.length]
  )
  const isZoomed = zoom !== 1

  // Escape steps back out of the zoom before it closes the lightbox: having
  // magnified into a detail, "get me out of this" means the detail first.
  //
  // Read through refs so the callback's own identity never changes.
  // useDialogA11y's effect lists onCancel in its dependencies, so a
  // callback rebuilt on every zoom change would tear down and re-run the
  // whole trap -- which re-runs `initial?.focus()` and yanks focus back to
  // the close button mid-interaction. (The same was latently true of any
  // caller passing an unstable onClose.)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const handleCancel = useCallback(() => {
    if (zoomRef.current !== 1) {
      setZoom(1)
      return
    }
    onCloseRef.current?.()
  }, [])

  useDialogA11y({ containerRef, onCancel: handleCancel, initialFocusRef: closeButtonRef })

  // A zoom belongs to the image it was taken on, not to the lightbox: moving
  // to another image (arrow key, arrow button) starts it fitted again.
  useEffect(() => { setZoom(1) }, [current])

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

  const toggleZoom = (e) => {
    if (isZoomed) {
      setZoom(1)
      return
    }
    // `detail` is 0 for a click synthesized from Enter/Space on the focused
    // button, where clientX/clientY are meaningless -- that case zooms to
    // the centre rather than to wherever the pointer happens to be parked.
    if (e.detail > 0) setOrigin(originFromPointer(e))
    else setOrigin({ x: 50, y: 50 })
    setZoom(ZOOM_SCALE)
  }

  // While zoomed, the pointer pans: the origin keeps tracking it, so moving
  // across the image walks the magnified view across the photograph. No drag
  // state, no scrollbars, and nothing to discover -- moving the mouse is
  // already what you do when looking for a detail.
  const trackPointer = (e) => { if (isZoomed) setOrigin(originFromPointer(e)) }

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
        <button type="button" className="lightbox-prev" onClick={() => move(-1)} aria-label="Précédent">
          <Chevron direction="left" />
        </button>
      )}
      <button
        type="button"
        className={`lightbox-image-button${isZoomed ? ' is-zoomed' : ''}`}
        onClick={toggleZoom}
        onMouseMove={trackPointer}
        aria-label={isZoomed ? 'Réduire' : 'Agrandir'}
        aria-pressed={isZoomed}
      >
        <img
          src={src(image?.variants?.large || image?.variants?.medium)}
          alt={image?.alt || ''}
          style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
        />
      </button>
      {hasMultiple && (
        <button type="button" className="lightbox-next" onClick={() => move(1)} aria-label="Suivant">
          <Chevron direction="right" />
        </button>
      )}
    </div>
  )
}
