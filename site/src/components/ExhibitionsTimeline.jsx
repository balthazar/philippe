import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { groupExhibitionsByYear, layoutExhibitionsTimeline } from '@/lib/exhibitionsOrder.js'

/**
 * Task 36, section 3: the minimum pixel gap enforced between every pair of
 * consecutive dots (see layoutExhibitionsTimeline, lib/exhibitionsOrder.js).
 * Chosen against the real archive (39 exhibitions, 1989..2024, 2013 holds
 * five): pure proportional placement puts a five-way year like 2013 about
 * 4px apart -- unusable, per the task brief. 10px is comfortably more than
 * that (each dot is legible as its own mark, not a smear) while still
 * cheap enough that even the densest real cluster (2013's five) only needs
 * 40px of local expansion, nowhere near enough to threaten the "whole rail
 * fits the available height" invariant on any realistic desktop viewport.
 */
const MIN_DOT_GAP = 10

/**
 * Task 36, section 2: matches each dot's own rendered hit area in base.css
 * (`.exhibitions-timeline a`'s 0.5625rem padding on all sides around the
 * 0.375rem dot: 0.5625*2 + 0.375 = 1.5rem = 24px at the default root size).
 * A dot's `<li>` is centred on its computed `top` (`transform:
 * translateY(-50%)`), so the newest (top: 0) and oldest (top: height) dots'
 * OWN hit boxes would otherwise extend 12px above/below the rail's [0,
 * height] domain -- past the header at the top, and (confirmed in a real
 * browser) enough to push the whole page 12px taller than the viewport at
 * the bottom, forcing exactly the page scroll this task exists to remove.
 * Insetting the usable domain by half this size, and offsetting every
 * computed position by that same half, keeps every dot's hit box fully
 * inside the rail's own box.
 */
const DOT_HIT_SIZE = 24

/**
 * Task 36, section 2/6: the rail must never scroll, so its own available
 * height has to be known in real pixels before dots can be placed -- CSS
 * alone cannot express "spread these out, enforcing a minimum gap, within
 * whatever height this box actually ends up being". This is the fallback
 * used before a real measurement exists (first paint, and any environment
 * with no ResizeObserver -- e.g. this project's jsdom test environment):
 * matches the brief's own real-archive estimate (35 years over roughly
 * 700px of usable height) closely enough that a first, unmeasured paint
 * looks reasonable rather than collapsed to nothing.
 */
const FALLBACK_RAIL_HEIGHT = 700

/**
 * Measures `ref`'s own content height in real pixels, live: a plain
 * `getBoundingClientRect()` read once would go stale the moment the
 * viewport (or anything above this in the flex/grid chain) resizes, and
 * this rail's whole point is to never need a scrollbar regardless of
 * viewport height. Falls back to FALLBACK_RAIL_HEIGHT wherever
 * ResizeObserver does not exist (this project's jsdom test environment;
 * `layoutExhibitionsTimeline`'s own invariants do not depend on the exact
 * height passed in, only on ordering/spacing/fit, so a fixed fallback is
 * enough for every test that renders this component).
 */
function useRailHeight(ref) {
  const [height, setHeight] = useState(FALLBACK_RAIL_HEIGHT)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setHeight(el.clientHeight || FALLBACK_RAIL_HEIGHT)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return height
}

/**
 * Task 31, part 1 / task 35, Part B / task 36: the client's "every fifth"
 * instruction is read against the dots, not the calendar -- there is one
 * dot per exhibition (not one per calendar year, so 1989-2024's gaps are
 * never represented), and persistent labels land on every fifth dot
 * counting from the newest (index 0, 5, 10, ...), plus the current year,
 * plus the newest and oldest so the span is always readable with no
 * pointer or keyboard interaction at all.
 */
function isPersistentIndex(index, length, isCurrent) {
  return isCurrent || index % 5 === 0 || index === length - 1
}

/**
 * Task 36, item 4: which exhibition the floating scrubber label should
 * currently describe, chosen from a raw pointer Y (relative to the rail's
 * own top) by nearest computed dot position -- this is what lets the
 * viewer "point at the rail" rather than needing to land exactly on a
 * dot's own few-pixel hit area.
 */
function nearestIndexByY(positions, y) {
  let nearest = 0
  let nearestDistance = Infinity
  positions.forEach((position, index) => {
    const distance = Math.abs(position - y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = index
    }
  })
  return nearest
}

/**
 * Task 28, part 3 / task 31 / task 35, Part B / task 36: a year timeline
 * for the exhibitions section, rendered as persistent chrome by both the
 * /expositions index (most recent year current) and every individual
 * exhibition article page (its own year current) -- see
 * ExhibitionsLayout.jsx, the shared nested layout route both render
 * through (Task 32, item 1).
 *
 * `items` must already be sorted (lib/exhibitionsOrder.js): this component
 * only renders, it does not decide chronology.
 *
 * Task 36 rewrite (sections 2-5): the rail used to lay dots out with plain
 * CSS flex/gap, capped to a max-height with its own hidden scrollbar once
 * 39 dots stopped fitting a normal viewport -- the client rejected that
 * scroll twice. Every dot is now given an explicit `top` in pixels, computed
 * by layoutExhibitionsTimeline (lib/exhibitionsOrder.js) against the rail's
 * own real, measured height (useRailHeight above): proportional by year,
 * with a minimum gap enforced so a dense year (2013 holds five) expands
 * locally instead of collapsing to a few unreadable/unclickable pixels,
 * while the whole rail still always fits inside that measured height --
 * nothing is ever clipped or scrolled.
 *
 * The DOM is flat now (one `<li>` per EXHIBITION, absolutely positioned),
 * not the previous two-level "one outer `<li>` per year, dots nested
 * inside" nesting -- that nesting existed to keep a year's own dots
 * visually adjacent under normal flex flow, which no longer applies once
 * every dot has its own independent, individually-computed position (a
 * multi-exhibition year's dots are typically close together after layout,
 * but not guaranteed contiguous the way shared flex-item order guaranteed
 * before). The YEAR LABEL is still rendered once per year, not once per
 * dot -- via `groups` (groupExhibitionsByYear) -- but as its own sibling
 * element positioned at that year's first (topmost/newest) exhibition,
 * rather than as a child of a shared wrapping `<li>`.
 *
 * Task 36, item 4: hover-to-reveal-a-label is retired -- the previous
 * design tied it to CSS `:hover`/`:focus-within` on each year's own shared
 * `<li>`. In its place, ONE floating element (`.exhibitions-timeline-scrub`)
 * tracks either the pointer's Y position over the rail or, for keyboard
 * users, whichever dot currently holds focus -- both drive the same
 * `active` state, so the label "appears on keyboard focus exactly as it
 * does on hover" is satisfied by construction, not by two separate code
 * paths that could drift. It is `aria-hidden`: purely a sighted, pointer/
 * focus-following convenience -- a screen reader already gets a fuller,
 * per-exhibition announcement from each link's own accessible name below,
 * which this never replaces.
 *
 * `aria-current` marks the current EXHIBITION's own link (`currentSlug`),
 * never a whole year -- a year is not "the" current exhibition once it can
 * hold several. A single-exhibition year's link is named just its year
 * ("2024"); a multi-exhibition year's links are each named the year PLUS
 * its own title ("2019 – Premier lieu"), since 39 links that can read
 * "2013" five times over would be useless to a screen reader.
 */
export function ExhibitionsTimeline({ items, currentSlug, currentYear }) {
  const { href, lang } = useLang()
  const railRef = useRef(null)
  const height = useRailHeight(railRef)
  const groups = groupExhibitionsByYear(items)
  const total = items?.length || 0
  const inset = DOT_HIT_SIZE / 2
  const usableHeight = Math.max(0, height - DOT_HIT_SIZE)
  const positions = layoutExhibitionsTimeline(items, { height: usableHeight, minGap: MIN_DOT_GAP }).map(
    (p) => p + inset
  )

  const [activeSlug, setActiveSlug] = useState(null)
  const activeIndex = activeSlug ? items.findIndex((item) => item.slug === activeSlug) : -1
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null

  // Restores the label to whichever dot currently holds keyboard focus (if
  // any) rather than always clearing on mouse-leave -- a sighted keyboard
  // user who tabs to a dot and then happens to wiggle the mouse off the
  // rail should not lose the label a moment later.
  const handleLeave = () => {
    const el = railRef.current
    const focused = el && document.activeElement !== document.body && el.contains(document.activeElement)
      ? document.activeElement
      : null
    setActiveSlug(focused?.dataset.slug || null)
  }

  const handleMove = (e) => {
    if (!total) return
    const rect = railRef.current.getBoundingClientRect()
    const nearest = nearestIndexByY(positions, e.clientY - rect.top)
    setActiveSlug(items[nearest].slug)
  }

  let flatIndex = -1

  return (
    <nav
      className="exhibitions-timeline"
      aria-label={lang === 'fr' ? 'Chronologie des expositions' : 'Exhibitions timeline'}
    >
      <ol
        ref={railRef}
        className="exhibitions-timeline-rail"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {items.map((item, i) => {
          flatIndex += 1
          const isCurrent = item.slug === currentSlug
          const group = groups.find((g) => g.year === item.yearStart)
          const multi = group.items.length > 1
          return (
            <li key={item.slug} className="exhibitions-timeline-dot-item" style={{ top: `${positions[i]}px` }}>
              <Link
                to={href('article', item.slug)}
                data-slug={item.slug}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={multi ? `${item.yearStart} – ${item.title}` : String(item.yearStart)}
                onFocus={() => setActiveSlug(item.slug)}
                onBlur={(e) => {
                  if (!railRef.current?.contains(e.relatedTarget)) setActiveSlug(null)
                }}
              >
                <span className="exhibitions-timeline-dot" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ol>

      {groups.map((group) => {
        const groupStartIndex = items.findIndex((item) => item.yearStart === group.year)
        const isCurrentGroup = group.year === currentYear
        const isPersistent =
          isCurrentGroup ||
          group.items.some((item, i) => isPersistentIndex(groupStartIndex + i, total, item.slug === currentSlug))
        const className = [
          'exhibitions-timeline-label',
          isPersistent && 'is-persistent',
          isCurrentGroup && 'is-current-year',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <span key={group.year} className={className} aria-hidden="true" style={{ top: `${positions[groupStartIndex]}px` }}>
            {group.year}
          </span>
        )
      })}

      {activeItem && (
        <div
          className="exhibitions-timeline-scrub"
          aria-hidden="true"
          style={{ top: `${positions[activeIndex]}px` }}
        >
          <span className="exhibitions-timeline-scrub-year">{activeItem.yearStart}</span>
          <span className="exhibitions-timeline-scrub-title">{activeItem.title}</span>
        </div>
      )}
    </nav>
  )
}
