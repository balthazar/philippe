import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion.js'

const src = (v) => (v?.path ? `/media/${v.path}` : '')
const largeVariant = (item) => item?.image?.variants?.large || item?.image?.variants?.medium

// Fade change, in two halves: the outgoing image fades to white over
// FADE_OUT_MS, then the incoming one fades up over FADE_IN_MS, 600ms total.
// Kept in sync by hand with --fade-out-ms/--fade-in-ms in design/tokens.css.
const FADE_OUT_MS = 300
const FADE_IN_MS = 300
const TRANSITION_MS = FADE_OUT_MS + FADE_IN_MS

/**
 * Task 30, part 4: a gallery block's slider display mode -- one image at a
 * time, advancing on a timer, with previous/next arrows once there is more
 * than one image.
 *
 * DELIBERATELY NOT built on a shared hook with the homepage Slideshow, even
 * though that was the first approach tried here and the brief's own
 * preference. Sharing surfaced as a real regression during QA: this
 * fade-through-white mechanism is fragile in ways jsdom cannot see at all
 * (paint order, real CSS transition timing, a same-vs-different animation
 * frame race between React's effect scheduling and a `requestAnimationFrame`
 * inside it) -- it took several correction rounds to get right in Slideshow
 * originally, and every one of those details has to survive intact. Rather
 * than risk the live, working homepage slideshow on an extraction that
 * *looked* like a faithful 1:1 lift (and passed 16/16 unit tests either way,
 * since jsdom cannot tell the difference), Slideshow.jsx was reverted to
 * its exact original, untouched implementation, and this component
 * duplicates the same battle-tested pattern independently instead of
 * sharing it. A working slideshow beats an elegant abstraction. If this
 * mechanism is ever extracted again, it needs real-browser verification
 * (not just a green test suite) at every step, per the comment in base.css
 * describing exactly this failure mode happening once already.
 *
 * Keyboard handling is scoped to this component's own container (not
 * `window`, unlike Slideshow): this is embedded content and an article can
 * hold more than one slider gallery, so it must only ever respond to arrow
 * keys while it itself has focus.
 *
 * `items` must already be the hidden-filtered, public list (BlockRenderer's
 * job); this component only ever shows what it is given.
 */
export function GallerySlider({ items = [], onActivate, interval = 5000 }) {
  const containerRef = useRef(null)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()

  const count = items.length
  const move = useCallback((delta) => setIndex((i) => (i + delta + count) % count), [count])

  useEffect(() => { setIndex(0) }, [count])
  const safeIndex = count ? index % count : 0
  const current = count ? items[safeIndex] : null

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [move])

  // setTimeout keyed on the current slide, not a free-running setInterval:
  // a manual arrow press or a resumed pause starts a fresh full interval,
  // rather than being pre-empted by a timer that was already mid-flight.
  useEffect(() => {
    if (reduced || paused || count < 2) return undefined
    const timer = setTimeout(() => move(1), interval)
    return () => clearTimeout(timer)
  }, [reduced, paused, count, interval, move, safeIndex])

  // Fade out, then fade in -- deliberately NOT a true crossfade; see the
  // file-level comment. z-index on the outgoing image is load-bearing, not
  // decoration: both images are absolutely positioned in the same stage and
  // the outgoing one is rendered FIRST in the DOM, so without an explicit
  // stacking order the incoming image paints over it and the fade-out
  // happens invisibly behind an opaque image.
  const [outgoing, setOutgoing] = useState(null)
  const [entering, setEntering] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const prevRef = useRef(null)
  const outgoingTimeoutRef = useRef(null)
  const leavingFrameRef = useRef(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = current

    if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null }
    if (leavingFrameRef.current) { cancelAnimationFrame(leavingFrameRef.current); leavingFrameRef.current = null }

    if (!prev || !current || prev === current || reduced) {
      setOutgoing(null)
      setLeaving(false)
      setEntering(false)
      return undefined
    }

    setOutgoing(prev)
    setLeaving(false)
    setEntering(true)
    // Let the outgoing image paint once at full opacity before flipping the
    // class that transitions it to 0, so the browser actually animates the
    // change instead of jumping straight to it.
    //
    // Task 32, item 4: same fix as Slideshow.jsx, applied independently here
    // (this file deliberately does not share code with Slideshow -- see the
    // file-level comment above). A single rAF loses the race against a
    // click handler's own frame -- the outgoing/incoming images' final
    // classes can commit before the freshly-mounted "before" state ever
    // paints, so there is nothing for the CSS transition to animate from,
    // and the fade collapses into an instant swap. A timer-driven update
    // (autoplay) doesn't hit this because it runs as its own task, after
    // the previous frame already painted. Nesting a second rAF guarantees a
    // real paint lands between the two commits either way.
    leavingFrameRef.current = requestAnimationFrame(() => {
      leavingFrameRef.current = requestAnimationFrame(() => {
        setLeaving(true)
        leavingFrameRef.current = null
      })
    })
    outgoingTimeoutRef.current = setTimeout(() => {
      setOutgoing(null)
      setLeaving(false)
      setEntering(false)
      outgoingTimeoutRef.current = null
    }, TRANSITION_MS)

    return () => {
      if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null }
      if (leavingFrameRef.current) { cancelAnimationFrame(leavingFrameRef.current); leavingFrameRef.current = null }
    }
  }, [current, reduced])

  if (!count) return null

  const outgoingLarge = largeVariant(outgoing)
  const currentLarge = largeVariant(current)

  return (
    <div
      className="gallery-slider"
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="gallery-slider-stage">
        {outgoing && (
          <img
            key={`outgoing-${outgoingLarge?.path}`}
            className={`gallery-slider-image gallery-slider-image--outgoing${leaving ? ' is-leaving' : ''}`}
            src={src(outgoingLarge)}
            alt={outgoing.image?.alt || ''}
            width={outgoingLarge?.width}
            height={outgoingLarge?.height}
          />
        )}
        <button
          type="button"
          className="gallery-slider-image-button"
          aria-label={current?.image?.alt || `Image ${safeIndex + 1}`}
          onClick={() => onActivate?.(safeIndex)}
        >
          <img
            key={`current-${currentLarge?.path}`}
            className={`gallery-slider-image${entering ? ' gallery-slider-image--entering' : ''}${entering && leaving ? ' is-entered' : ''}`}
            src={src(currentLarge)}
            alt={current?.image?.alt || ''}
            width={currentLarge?.width}
            height={currentLarge?.height}
          />
        </button>
      </div>
      {count > 1 && (
        <div className="gallery-slider-controls">
          <button type="button" onClick={() => move(-1)} aria-label="Précédent">‹</button>
          <span aria-live="polite">{safeIndex + 1} / {count}</span>
          <button type="button" onClick={() => move(1)} aria-label="Suivant">›</button>
        </div>
      )}
    </div>
  )
}
