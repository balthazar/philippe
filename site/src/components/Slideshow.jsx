import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion.js'

const src = (v) => (v?.path ? `/media/${v.path}` : '')
const largeVariant = (slide) => slide?.image?.variants?.large

// Client decision: crossfade, 600ms. Not a slide, not a fade through white,
// no Ken Burns pan/zoom.
// Two halves of the slide change: the outgoing work fades to white, then the
// incoming one fades up from it. Kept in sync by hand with --fade-out-ms and
// --fade-in-ms in base.css; CSS drives the animation, JS only needs to know
// the total so it knows when to unmount the outgoing image.
const FADE_OUT_MS = 300
const FADE_IN_MS = 300
const TRANSITION_MS = FADE_OUT_MS + FADE_IN_MS

export function Slideshow({ slides = [], interval = 5000 }) {
  const { href, lang } = useLang()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()

  // Skip a slide with no image rather than rendering an empty <img>. The API
  // already filters these out (GET /home only selects works with a cover),
  // but a manual override could still slip one in, so guard defensively here
  // too. Indexing and wraparound below operate on this filtered list, not
  // the raw `slides` prop.
  const playable = slides.filter((s) => s?.image?.variants?.large)
  const count = playable.length
  const move = useCallback((delta) => setIndex((i) => (i + delta + count) % count), [count])

  // Reset to the first slide whenever the underlying slide list changes
  // (e.g. Home re-fetches after a language switch), so a stale index can't
  // point past the end of a shorter list. `safeIndex` below also guards the
  // single render that happens before this effect flushes.
  useEffect(() => { setIndex(0) }, [count])
  const safeIndex = count ? index % count : 0
  const currentSlide = count ? playable[safeIndex] : null

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  // setTimeout keyed on the current slide, not a free-running setInterval:
  // the effect re-runs on every slide change, so a manual arrow press, a
  // keyboard nav or a resumed pause all start a fresh full interval. With an
  // interval, a viewer who clicked next partway through would be advanced
  // again by the timer they had just pre-empted, sometimes milliseconds
  // later. Every slide the viewer lands on gets the whole `interval`.
  useEffect(() => {
    if (reduced || paused || count < 2) return undefined
    const timer = setTimeout(() => move(1), interval)
    return () => clearTimeout(timer)
  }, [reduced, paused, count, interval, move, safeIndex])

  // Fade out, then fade in -- deliberately NOT a true crossfade. Works in this
  // archive have very different aspect ratios (roughly 0.86 to 1.72), so two
  // images overlapping at partial opacity only coincide over part of their
  // area: the rest reads as a ghost of one work sticking out past the edges of
  // the other. Fading the outgoing work fully to white first, then bringing
  // the incoming one up, means the two are never visible at once.
  //
  // Split evenly: FADE_OUT_MS then FADE_IN_MS, together TRANSITION_MS. The
  // incoming image's CSS carries a transition-delay equal to the fade-out, so
  // both halves are driven by the single class flip below.
  const [outgoing, setOutgoing] = useState(null)
  const [entering, setEntering] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const prevSlideRef = useRef(null)
  const outgoingTimeoutRef = useRef(null)
  const leavingFrameRef = useRef(null)

  useEffect(() => {
    const prev = prevSlideRef.current
    prevSlideRef.current = currentSlide

    if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null }
    if (leavingFrameRef.current) { cancelAnimationFrame(leavingFrameRef.current); leavingFrameRef.current = null }

    if (!prev || !currentSlide || prev === currentSlide || reduced) {
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
    // Task 32, item 4: a SINGLE rAF here lost this race when the update
    // originated in a click handler (the arrows) rather than a timer
    // (autoplay). A click handler runs early enough in the browser's frame
    // that a rAF scheduled from inside it can still fire before that same
    // frame paints -- so the "setOutgoing/setEntering" commit above was
    // never actually painted before `leaving` (and therefore `is-entered`,
    // `is-leaving`) flipped, and the outgoing/incoming images went straight
    // from freshly-mounted to their final state with nothing painted in
    // between for the transition to start from: an instant swap, no fade. A
    // timer callback runs as its own task, effectively always after the
    // previous frame's paint, so the same single rAF reliably landed in the
    // NEXT frame there and the fade worked. Nesting a second rAF forces a
    // real paint to land between the two commits regardless of which kind
    // of event triggered the update. Confirmed by reproducing the instant
    // swap on a click with a single rAF and watching it disappear with the
    // nested one, in a real browser -- jsdom has no paint pipeline, so it
    // cannot see this race at all (see Slideshow.test.jsx).
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
  }, [currentSlide, reduced])

  // Preload the next slide's large variant so it is already decoded by the
  // time it becomes the incoming image and starts its fade in `interval`ms
  // (or on the next arrow-key press). Without this, a cold cache reveals a
  // blank rectangle mid-fade, which looks worse than the hard cut it
  // replaces.
  useEffect(() => {
    if (count < 2) return undefined
    const upcoming = playable[(safeIndex + 1) % count]
    const url = src(largeVariant(upcoming))
    if (!url) return undefined
    const preload = new Image()
    preload.src = url
    return () => { preload.src = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, count, slides])

  if (!count) return null
  const slide = currentSlide
  const caption = slide.caption || slide.article?.title
  const year = slide.article?.yearLabel
  const outgoingLarge = largeVariant(outgoing)
  const currentLarge = largeVariant(slide)

  return (
    <section
      className="slideshow"
      aria-roledescription="carousel"
      aria-label={lang === 'fr' ? 'Diaporama des œuvres récentes' : 'Recent works slideshow'}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="slideshow-stage">
        {outgoing && (
          <img
            key={`outgoing-${outgoingLarge?.path}`}
            className={`slideshow-image slideshow-image--outgoing${leaving ? ' is-leaving' : ''}`}
            src={src(outgoingLarge)}
            alt={outgoing.image?.alt || ''}
            width={outgoingLarge?.width}
            height={outgoingLarge?.height}
          />
        )}
        <img
          key={`current-${currentLarge?.path}`}
          className={`slideshow-image${entering ? ' slideshow-image--entering' : ''}${entering && leaving ? ' is-entered' : ''}`}
          src={src(currentLarge)}
          alt={slide.image?.alt || ''}
          width={currentLarge?.width}
          height={currentLarge?.height}
        />
      </div>
      {/* Hover-pause lives on this strip, NOT on the <section>. The section
          is full-bleed and 100dvh tall, so a pointer anywhere on the page
          would sit inside it and pause autoplay permanently -- the slideshow
          would simply never advance for anyone using a mouse. Pausing while
          the pointer is over the caption and controls still covers the case
          that matters: someone reading the title or reaching for an arrow.
          Keyboard users get the same via onFocusCapture on the section. */}
      <div
        className="slideshow-chrome"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {slide.article?.slug && (
          <Link to={href('works', slide.article.slug)} className="slide-caption">
            {caption}
            {year ? ` | ${year}` : ''}
          </Link>
        )}
        <div className="slideshow-controls">
          <button type="button" onClick={() => move(-1)} aria-label={lang === 'fr' ? 'Précédent' : 'Previous'}>‹</button>
          <span aria-live="polite">{safeIndex + 1} / {count}</span>
          <button type="button" onClick={() => move(1)} aria-label={lang === 'fr' ? 'Suivant' : 'Next'}>›</button>
        </div>
      </div>
    </section>
  )
}
