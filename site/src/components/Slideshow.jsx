import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

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

export function Slideshow({ slides = [], interval = 6000 }) {
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
  // point past the end of a shorter list.
  useEffect(() => { setIndex(0) }, [count])

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

  if (!count) return null
  const slide = playable[index]
  const caption = slide.caption || slide.article?.title
  const year = slide.article?.yearLabel

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
      <img src={src(slide.image?.variants?.large)} alt={slide.image?.alt || ''} />
      {slide.article?.slug && (
        <Link to={href('works', slide.article.slug)} className="slide-caption">
          {caption}
          {year ? ` | ${year}` : ''}
        </Link>
      )}
      <div className="slideshow-controls">
        <button type="button" onClick={() => move(-1)} aria-label={lang === 'fr' ? 'Précédent' : 'Previous'}>‹</button>
        <span aria-live="polite">{index + 1} / {count}</span>
        <button type="button" onClick={() => move(1)} aria-label={lang === 'fr' ? 'Suivant' : 'Next'}>›</button>
      </div>
    </section>
  )
}
