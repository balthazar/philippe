import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion.js'

// Task 29, part 4: replaces the timeline's own always-visible scrollbar
// (hidden in CSS, see .exhibitions-timeline in base.css) with the
// "drag near a window edge" pattern: holding the pointer near the top or
// bottom edge of the list scrolls it gently in that direction. Discoverable
// edges (a soft fade where there's more content) are also pure CSS -- the
// classic dual-gradient "scroll shadow" trick -- so they're correct before
// this effect ever attaches, and stay correct if it never runs at all.
//
// Every constraint below is load-bearing (task brief, part 4):
//   - this is ADDITIVE, never the only way to scroll: it only ever nudges
//     the nav's own native scrollTop, which wheel/trackpad/touch/keyboard
//     scrolling (and keyboard FOCUS, natively, on a scrollable ancestor)
//     already reach without any of this code running at all;
//   - a pointer must DWELL at an edge for EDGE_DWELL_MS before anything
//     moves, so a pointer merely passing through on its way elsewhere never
//     triggers it;
//   - any real, user-initiated scroll (wheel or touch) wins outright: it
//     cancels whatever is running or about to start, and auto-scroll does
//     not resume until the pointer actually moves again;
//   - it stops the instant the pointer leaves the edge zone (or the list);
//   - `prefers-reduced-motion: reduce` turns it off entirely.
const EDGE_SIZE = 48 // px from the top/bottom edge that counts as "near"
const EDGE_DWELL_MS = 200 // pointer must stay in the zone this long before scrolling starts
const SCROLL_TICK_MS = 16 // ~60fps
const SCROLL_STEP_PX = 6 // nudge per tick while auto-scrolling

/**
 * Task 28, part 3: a year timeline for the exhibitions section, rendered as
 * persistent chrome by both the /expositions index (most recent year
 * current) and every individual exhibition article page (its own year
 * current) -- see ExhibitionsChrome.jsx, the shared wrapper both use.
 *
 * `items` must already be sorted (lib/exhibitionsOrder.js): this component
 * only renders, it does not decide chronology.
 *
 * Every year is a real, always-clickable `<Link>` at its unmagnified size --
 * the dock-style hover/focus magnification in base.css is pure decoration,
 * layered on top via CSS transforms so it never affects hit target size,
 * layout, or focus order.
 */
export function ExhibitionsTimeline({ items, currentSlug }) {
  const { href, lang } = useLang()
  const currentRef = useRef(null)
  const navRef = useRef(null)
  const reducedMotion = usePrefersReducedMotion()

  // A 25-item column is taller than most viewports. Rather than making a
  // visitor hunt for the current year, scroll it into view as soon as this
  // list (or which year is current) settles -- guarded because jsdom has no
  // scrollIntoView implementation at all, and some real browsers omit it too.
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [currentSlug, items])

  useEffect(() => {
    if (reducedMotion) return undefined
    const nav = navRef.current
    if (!nav) return undefined

    let dwellTimer = null
    let tickTimer = null
    let direction = null

    const stop = () => {
      if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
      direction = null
    }

    const startDwell = (dir) => {
      if (direction === dir || dwellTimer) return
      dwellTimer = setTimeout(() => {
        dwellTimer = null
        direction = dir
        tickTimer = setInterval(() => { nav.scrollTop += direction * SCROLL_STEP_PX }, SCROLL_TICK_MS)
      }, EDGE_DWELL_MS)
    }

    const onPointerMove = (e) => {
      // Nothing to do below the desktop breakpoint, where the list scrolls
      // horizontally instead (see base.css) and this effect stays inert --
      // and nothing to do at all once there's no vertical overflow.
      if (nav.scrollHeight <= nav.clientHeight) { stop(); return }
      const rect = nav.getBoundingClientRect()
      const y = e.clientY - rect.top
      if (y < EDGE_SIZE) {
        if (direction !== -1) { stop(); startDwell(-1) }
      } else if (y > rect.height - EDGE_SIZE) {
        if (direction !== 1) { stop(); startDwell(1) }
      } else {
        stop()
      }
    }

    const onPointerLeave = () => stop()

    // A real, user-initiated scroll always wins: stop whatever is running
    // or about to start. It only resumes on the next pointermove -- a
    // genuinely new signal that re-evaluates the zone from scratch, not a
    // stale one from before the user scrolled.
    const onUserScroll = () => stop()

    nav.addEventListener('pointermove', onPointerMove)
    nav.addEventListener('pointerleave', onPointerLeave)
    nav.addEventListener('wheel', onUserScroll, { passive: true })
    nav.addEventListener('touchmove', onUserScroll, { passive: true })

    return () => {
      stop()
      nav.removeEventListener('pointermove', onPointerMove)
      nav.removeEventListener('pointerleave', onPointerLeave)
      nav.removeEventListener('wheel', onUserScroll)
      nav.removeEventListener('touchmove', onUserScroll)
    }
  }, [reducedMotion])

  return (
    <nav
      ref={navRef}
      className="exhibitions-timeline"
      aria-label={lang === 'fr' ? 'Chronologie des expositions' : 'Exhibitions timeline'}
    >
      <ol>
        {items.map((item) => {
          const isCurrent = item.slug === currentSlug
          return (
            <li key={item._id || item.slug}>
              <Link
                ref={isCurrent ? currentRef : undefined}
                to={href('article', item.slug)}
                aria-current={isCurrent ? 'true' : undefined}
              >
                {item.title}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
