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

/**
 * How long the pointer has to sit still before every piece of chrome fades:
 * the legend, both arrows, the close button. What is left is the photograph
 * on white, which is what a fullscreen view is for.
 *
 * The legend answers "what am I looking at", a question asked once on
 * arriving at a photograph and not again while you study it; the controls
 * answer "how do I leave", which you only ask when you have already reached
 * for the mouse -- and reaching for the mouse is exactly what brings them
 * back. Two seconds is long enough to read a line and short enough to be
 * gone by the time you have stopped noticing the chrome at all.
 */
const IDLE_MS = 2000

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

  // The chrome shows on arrival and fades once the pointer has been still
  // for IDLE_MS, leaving the photograph alone on the screen. Any movement
  // brings it back. Which elements this hides is CSS's business (see
  // .lightbox.is-idle in base.css); this only decides when.
  //
  // `pointer` events, not `mouse`: a touch drag produces pointermove and no
  // mousemove at all, so a touch reader would watch the legend disappear
  // once and have no way to ask for it again. `pointerdown` is listened for
  // alongside, since a tap can land without a preceding move.
  //
  // Visibility is mirrored in a ref so the listener can decide whether a
  // state update is needed at all: pointermove fires continuously, and
  // calling setState on every one of them would re-render the lightbox
  // dozens of times a second while a reader simply moves the cursor across
  // the image. There are exactly two renders per cycle, one to hide and one
  // to come back.
  //
  // Keyed to `current` as well, so arrowing to the next photograph shows its
  // legend even if the pointer never moved -- the question "what is this
  // one" is new again on every image.
  const [chromeVisible, setChromeVisible] = useState(true)
  const chromeVisibleRef = useRef(true)
  useEffect(() => {
    let timer
    const show = () => {
      if (!chromeVisibleRef.current) {
        chromeVisibleRef.current = true
        setChromeVisible(true)
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        chromeVisibleRef.current = false
        setChromeVisible(false)
      }, IDLE_MS)
    }
    show()
    window.addEventListener('pointermove', show)
    window.addEventListener('pointerdown', show)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', show)
      window.removeEventListener('pointerdown', show)
    }
  }, [current])

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
      className={`lightbox${chromeVisible ? '' : ' is-idle'}`}
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
      {/*
        The photograph's own legend -- its title, year and dimensions --
        which on the article page is a numbered list further down the page,
        matched to the pictures by counting. In here that list is off screen,
        so a reader in fullscreen had no way to know what they were looking
        at. `alt` is where that text lives per-image (the media library's
        "Texte alternatif"; see migrate/stampLegends.js, which derived it from
        each article's own list), so it is what is shown.

        Rendered only when there IS one: most exhibition photographs are
        installation views with no legend to give, and an empty bar under
        every one of those would be a permanent piece of furniture standing
        in for nothing. It also stays out of the way of the image itself --
        no backdrop, no reserved strip -- so the photograph keeps the whole
        stage and this reads as a margin note under it.

        It fades out with the rest of the chrome once the pointer has been
        still for two seconds (see IDLE_MS above) and returns on the next
        movement, so the photograph ends up alone on the screen without the
        legend ever becoming something you have to dismiss. It is also
        selectable, so the title and dimensions can be copied -- see
        .lightbox-legend in base.css for why that took more than saying so.

        aria-hidden, deliberately: this is the same string the <img> above
        already carries as its alt text, so without it a screen reader
        announces the legend twice, once as the image and once as the text
        beneath it. It also means the idle fade has no effect on what
        assistive technology reports -- the alt text is always there.
      */}
      {image?.alt && (
        <p className="lightbox-legend" aria-hidden="true">{image.alt}</p>
      )}
    </div>
  )
}
