import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion.js'
import { useCrossfade } from '@/lib/useCrossfade.js'
import { Chevron } from './Chevron.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')
const largeVariant = (item) => item?.image?.variants?.large || item?.image?.variants?.medium

const FADE_OUT_MS = 300

/**
 * Task 30, part 4: a gallery block's slider display mode -- one image at a
 * time, advancing on a timer, with previous/next arrows once there is more
 * than one image.
 *
 * Task 35, Part A rewrite: now built on the SAME useCrossfade.js hook as
 * the homepage Slideshow, rather than duplicating its own copy of the fade
 * mechanism. An earlier attempt at sharing was reverted because it could
 * not be verified (the two-image-element design was fragile in ways jsdom
 * cannot see -- paint order, real transition timing, a click-vs-timer
 * requestAnimationFrame race), and duplicating a battle-tested but fragile
 * mechanism was judged safer than risking the live homepage slideshow on an
 * extraction that merely *looked* like a faithful lift. The rewrite removes
 * the fragility itself (one persistent element, no rAF, no node-identity
 * bookkeeping -- see useCrossfade.js and Slideshow.jsx's own comments), so
 * that risk is gone: this is now a real, shared implementation, not two
 * parallel copies of the same one, and it has been browser-verified the
 * same way Slideshow.jsx was (see the task report).
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

  const { displayed, visible } = useCrossfade(current, { reduced, fadeOutMs: FADE_OUT_MS })

  if (!count || !displayed) return null
  const large = largeVariant(displayed)

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
        <button
          type="button"
          className="gallery-slider-image-button"
          aria-label={displayed.image?.alt || `Image ${safeIndex + 1}`}
          onClick={() => onActivate?.(safeIndex)}
        >
          <img
            className={`gallery-slider-image${visible ? '' : ' is-hidden'}`}
            src={src(large)}
            alt={displayed.image?.alt || ''}
            width={large?.width}
            height={large?.height}
          />
        </button>
      </div>
      {count > 1 && (
        <div className="gallery-slider-controls">
          <button type="button" onClick={() => move(-1)} aria-label="Précédent">
            <Chevron direction="left" />
          </button>
          <span aria-live="polite">{safeIndex + 1} / {count}</span>
          <button type="button" onClick={() => move(1)} aria-label="Suivant">
            <Chevron direction="right" />
          </button>
        </div>
      )}
    </div>
  )
}
