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
  const [entered, setEntered] = useState(false)
  // The last slide that finished settling (fully visible, nothing mid-fade)
  // -- see the effect below for why this, and not a ref reassigned on every
  // run, is what "previous" means here.
  const settledSlideRef = useRef(null)
  const outgoingTimeoutRef = useRef(null)
  const leavingFrameRef = useRef(null)
  const enteringFrameRef = useRef(null)

  // Task 33, section 4: re-entrancy. A new slide change can arrive while the
  // previous one is still fading (rapid arrow clicks, faster than the 600ms
  // transition). The client's own diagnosis, independently confirmed here:
  // clicking faster than the transition was cancelling something. The chosen
  // fix is to INTERRUPT, not block -- every click still produces a fade,
  // nothing is swallowed, which matters on a page whose arrows exist
  // precisely so someone can scan through works quickly.
  //
  // The bug was never really about `prevSlideRef` being reassigned every run
  // (though the old code did that) -- it's about what "previous" means once
  // a change interrupts one already in flight. `settledSlideRef` only ever
  // advances when a slide has genuinely finished appearing (the TRANSITION_MS
  // timeout below, or the immediate no-op path when there is nothing to
  // animate) -- never on an interrupting run. That makes `outgoing` stable
  // across a whole burst of rapid clicks: it is computed from
  // settledSlideRef, which does not move mid-burst, so `setOutgoing` is
  // called with the SAME value on every interrupting run, and React does not
  // remount the DOM node for an unchanged value (same `key`, same element) --
  // its live, partially-faded opacity is never thrown away, CSS just keeps
  // interpolating it toward 0 exactly as already scheduled. This is the
  // "keep the node that is currently visible as the outgoing node and
  // re-target it, rather than mounting a replacement for it" requirement:
  // it falls out for free from never recomputing `outgoing` away from the
  // last settled slide, rather than from any special-cased node-identity
  // trick.
  //
  // The incoming ("entering") image is different: it is a genuinely new
  // image on every single call, click or timer, fresh or interrupting, so
  // its own two-frame mount-then-animate dance (the click-vs-timer race fix
  // below, untouched) always restarts. `entered` is deliberately its own
  // piece of state, independent of `leaving` -- the old code gated the
  // incoming image's `is-entered` class on `entering && leaving` (one flag
  // shared by both halves), which is exactly what would make a freshly
  // interrupting incoming image jump straight to its end state: `leaving`
  // could already be `true` from the in-flight outgoing fade this run does
  // NOT reset (see above), and a brand-new element mounting with its
  // "entered" class already applied on its very first paint never animates
  // at all (a transition needs a prior painted state to animate FROM, which
  // a newly-inserted node does not have).
  useEffect(() => {
    const prevSettled = settledSlideRef.current
    const wasAlreadyTransitioning = outgoingTimeoutRef.current != null

    if (!prevSettled || !currentSlide || prevSettled === currentSlide || reduced) {
      if (outgoingTimeoutRef.current) { clearTimeout(outgoingTimeoutRef.current); outgoingTimeoutRef.current = null }
      if (leavingFrameRef.current) { cancelAnimationFrame(leavingFrameRef.current); leavingFrameRef.current = null }
      if (enteringFrameRef.current) { cancelAnimationFrame(enteringFrameRef.current); enteringFrameRef.current = null }
      setOutgoing(null)
      setLeaving(false)
      setEntering(false)
      setEntered(false)
      settledSlideRef.current = currentSlide
      return undefined
    }

    if (!wasAlreadyTransitioning) {
      // A fresh transition, starting from rest: mount the outgoing image and
      // kick off its own two-frame paint-then-fade dance.
      setOutgoing(prevSettled)
      setLeaving(false)
      // Task 32, item 4: a SINGLE rAF here lost this race when the update
      // originated in a click handler (the arrows) rather than a timer
      // (autoplay). A click handler runs early enough in the browser's frame
      // that a rAF scheduled from inside it can still fire before that same
      // frame paints -- so the "setOutgoing" commit above was never actually
      // painted before `leaving` flipped, and the outgoing image went
      // straight from freshly-mounted to its final state with nothing
      // painted in between for the transition to start from: an instant
      // swap, no fade. A timer callback runs as its own task, effectively
      // always after the previous frame's paint, so the same single rAF
      // reliably landed in the NEXT frame there and the fade worked. Nesting
      // a second rAF forces a real paint to land between the two commits
      // regardless of which kind of event triggered the update. Confirmed by
      // reproducing the instant swap on a click with a single rAF and
      // watching it disappear with the nested one, in a real browser --
      // jsdom has no paint pipeline, so it cannot see this race at all (see
      // Slideshow.test.jsx). This path is untouched by the re-entrancy fix
      // below: it only ever runs for a transition starting from rest.
      leavingFrameRef.current = requestAnimationFrame(() => {
        leavingFrameRef.current = requestAnimationFrame(() => {
          setLeaving(true)
          leavingFrameRef.current = null
        })
      })
    }
    // else: interrupting a transition already in flight. `outgoing` is
    // already `prevSettled` (by construction -- see the comment above this
    // effect) and already mid-fade toward 0 on its own untouched schedule.
    // Deliberately not touched here: this is the fix. Re-running
    // setOutgoing/setLeaving on every interrupting call was what discarded
    // the live opacity and produced the jump the client saw.

    // The incoming image is always new (a genuinely different photo) on
    // every call, so it always restarts its own mount-then-animate dance,
    // independent of whether `outgoing` changed above.
    setEntering(true)
    setEntered(false)
    if (enteringFrameRef.current) cancelAnimationFrame(enteringFrameRef.current)
    enteringFrameRef.current = requestAnimationFrame(() => {
      enteringFrameRef.current = requestAnimationFrame(() => {
        setEntered(true)
        enteringFrameRef.current = null
      })
    })

    // Unmounts the outgoing image and marks the slide settled once its own
    // full transition has had time to finish. Deliberately restarted on
    // every call (interrupting or not): this clock answers "how long until
    // the CURRENT target is fully visible and outgoing can go away", which
    // genuinely changes on every interruption -- restarting it does not
    // touch `outgoing`'s own identity or its already-scheduled `is-leaving`
    // fade above.
    if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current)
    outgoingTimeoutRef.current = setTimeout(() => {
      setOutgoing(null)
      setLeaving(false)
      setEntering(false)
      setEntered(false)
      settledSlideRef.current = currentSlide
      outgoingTimeoutRef.current = null
    }, TRANSITION_MS)

    return () => {
      if (enteringFrameRef.current) { cancelAnimationFrame(enteringFrameRef.current); enteringFrameRef.current = null }
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
          className={`slideshow-image${entering ? ' slideshow-image--entering' : ''}${entered ? ' is-entered' : ''}`}
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
