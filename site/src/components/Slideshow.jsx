import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion.js'
import { useCrossfade } from '@/lib/useCrossfade.js'
import { usePreloadImage } from '@/lib/usePreloadImage.js'
import { isKeyboardFocus } from '@/lib/keyboardFocus.js'
import { Chevron } from './Chevron.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')
const largeVariant = (slide) => slide?.image?.variants?.large

// Client decision, settled over many rounds (task 35 brief): fade THROUGH
// WHITE, not a crossfade -- the outgoing image reaches zero opacity before
// the incoming one appears, so the two are never on screen together. ~300ms
// out, ~300ms in, 600ms total. Kept in sync by hand with --fade-out-ms /
// --fade-in-ms in base.css.
const FADE_OUT_MS = 300

/**
 * Task 35, Part A: rewritten from scratch on top of useCrossfade.js (see
 * that file for the state machine and why it needs no special-casing for
 * rapid or reversing navigation). Four separate patches had accumulated on
 * the previous two-image-element version -- a nested requestAnimationFrame,
 * an outgoing-slide ref that only advanced on settlement, a guard against
 * alternating back to the settled slide mid-flight, and re-entrancy
 * handling -- each correct about its own symptom, never simple. The second
 * image element was the actual source of nearly every one of those bugs
 * (node identity across remounts, losing a live opacity value when a keyed
 * element got replaced, deciding which of two nodes was "current"
 * mid-flight); it was also vestigial, since fade-through-white never shows
 * two images at once. This version renders exactly one <img>, never
 * unmounted, whose `src` changes only while it is invisible -- no rAF dance
 * at all, because the element already exists and has already been painted,
 * so there is nothing to wait for a frame to happen.
 *
 * `currentSlide` (this slide's own `article`/`caption`) drives the chrome
 * around the image -- caption, link, counter -- so those update the instant
 * a click or timer fires, matching the old behaviour: a click already felt
 * responsive even while the previous fix's fade was still catching up
 * visually. `useCrossfade`'s own `displayed` value, which lags by one
 * fade-out, drives only the <img> itself.
 */
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

  const { displayed, visible } = useCrossfade(currentSlide, { reduced, fadeOutMs: FADE_OUT_MS })

  // Preload the next slide's large variant so it is already decoded by the
  // time it becomes the displayed image and starts fading in. Without this,
  // a cold cache reveals a blank rectangle mid-fade, which looks worse than
  // the hard cut it replaces.
  //
  // Now usePreloadImage.js, shared with GallerySlider, which had never had
  // this and showed that exact symptom on every transition. Keying the hook
  // on the URL also retires the exhaustive-deps suppression this used to
  // need: `slides` was in the dep list as a proxy for "the list changed",
  // which re-ran the effect on every new array identity from the parent.
  usePreloadImage(count > 1 ? src(largeVariant(playable[(safeIndex + 1) % count])) : '')

  if (!count || !currentSlide) return null
  const caption = currentSlide.caption || currentSlide.article?.title
  const year = currentSlide.article?.yearLabel
  const shown = displayed || currentSlide
  const large = largeVariant(shown)

  return (
    <section
      className="slideshow"
      aria-roledescription="carousel"
      aria-label={lang === 'fr' ? 'Diaporama des œuvres récentes' : 'Recent works slideshow'}
      /* Keyboard focus only. A mouse click in Chrome focuses the arrow it
         clicked and that focus outlives the click, so clicking next once
         paused autoplay permanently -- measured at 13s with no advance.
         See keyboardFocus.js. */
      onFocusCapture={(e) => { if (isKeyboardFocus(e.target)) setPaused(true) }}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="slideshow-stage">
        {/*
          The photograph itself links to its work, not only the caption
          beneath it (client request). The image is the largest and most
          obvious thing on the homepage and it was the one part of the slide
          that did nothing when clicked, which reads as a dead page rather
          than as a deliberate choice.

          Wrapped around the <img> rather than around the stage: the stage is
          a full-height flex box, so a link spanning it would make the empty
          white either side of a portrait photograph clickable too, and
          swallow the whole viewport into one link.

          tabIndex -1, but NOT aria-hidden: the caption immediately below is
          already a link to this same work, so a second tab stop leads
          nowhere new -- but hiding the link outright would take the <img>
          inside it out of the accessibility tree with it, and that image now
          carries the photograph's own legend as its alt text. The extra tab
          stop is worth removing; the alt text is not.
        */}
        {shown.article?.slug ? (
          <Link
            to={href('works', shown.article.slug)}
            className="slideshow-image-link"
            tabIndex={-1}
          >
            <img
              className={`slideshow-image${visible ? '' : ' is-hidden'}`}
              src={src(large)}
              alt={shown.image?.alt || ''}
              width={large?.width}
              height={large?.height}
            />
          </Link>
        ) : (
          <img
            className={`slideshow-image${visible ? '' : ' is-hidden'}`}
            src={src(large)}
            alt={shown.image?.alt || ''}
            width={large?.width}
            height={large?.height}
          />
        )}
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
        {currentSlide.article?.slug && (
          <Link to={href('works', currentSlide.article.slug)} className="slide-caption">
            {caption}
            {year ? ` | ${year}` : ''}
          </Link>
        )}
        <div className="slideshow-controls">
          {/*
            The same drawn chevrons an exhibition's gallery slider uses, at
            the same size (--slider-arrow-size), rather than the ‹ and ›
            characters this control used to be set in -- see Chevron.jsx for
            why a quotation mark makes a poor arrow. One control, one
            appearance, wherever it turns up on the site.
          */}
          <button type="button" onClick={() => move(-1)} aria-label={lang === 'fr' ? 'Précédent' : 'Previous'}>
            <Chevron direction="left" />
          </button>
          {/*
            Heard, not seen (client request: arrows alone). The counter is
            still announced, because a carousel that never says where you are
            in it is disorienting to anyone who cannot watch the slide
            change, and keeping it for them costs nothing on screen.
          */}
          <span className="sr-only" aria-live="polite">{safeIndex + 1} / {count}</span>
          <button type="button" onClick={() => move(1)} aria-label={lang === 'fr' ? 'Suivant' : 'Next'}>
            <Chevron direction="right" />
          </button>
        </div>
      </div>
    </section>
  )
}
