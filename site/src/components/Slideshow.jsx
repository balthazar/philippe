import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')
const largeVariant = (slide) => slide?.image?.variants?.large

// Client decision: crossfade, 600ms. Not a slide, not a fade through white,
// no Ken Burns pan/zoom.
const TRANSITION_MS = 600

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    setReduced(mq.matches)
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

export function Slideshow({ slides = [], interval = 3000 }) {
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

  useEffect(() => {
    if (reduced || paused || count < 2) return undefined
    const timer = setInterval(() => move(1), interval)
    return () => clearInterval(timer)
  }, [reduced, paused, count, interval, move])

  // Crossfade: track the previous slide as `outgoing` for TRANSITION_MS while
  // `currentSlide` renders underneath at full opacity, then drop it. Only the
  // outgoing image animates (fading 1 -> 0), which reads as a crossfade
  // because the incoming slide is already opaque beneath it.
  const [outgoing, setOutgoing] = useState(null)
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
      return undefined
    }

    setOutgoing(prev)
    setLeaving(false)
    // Let the outgoing image paint once at full opacity before flipping the
    // class that transitions it to 0, so the browser actually animates the
    // change instead of jumping straight to it.
    leavingFrameRef.current = requestAnimationFrame(() => {
      setLeaving(true)
      leavingFrameRef.current = null
    })
    outgoingTimeoutRef.current = setTimeout(() => {
      setOutgoing(null)
      setLeaving(false)
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
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
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
          className="slideshow-image"
          src={src(currentLarge)}
          alt={slide.image?.alt || ''}
          width={currentLarge?.width}
          height={currentLarge?.height}
        />
      </div>
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
    </section>
  )
}
