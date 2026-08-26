import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import {
  groupExhibitionsByYear,
  layoutExhibitionsTimeline,
  persistentLabelYears,
} from '@/lib/exhibitionsOrder.js'

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
 * Task 38, part 9: the FALLBACK for a dot's own rendered hit area -- first
 * paint and jsdom only. It used to be this value unconditionally, hardcoded
 * against base.css and true only "at the default root size", as the note
 * below always admitted: the CSS is in rem, so a visitor browsing at a
 * larger root font size got a taller hit box than the 24 assumed here, and
 * every dot was inset by less than half its own height -- the bottommost
 * one hanging past the rail's bottom edge by the difference. The real box
 * is measured now (useElementHeight, on the first dot's own link), so the
 * two cannot disagree at any root size.
 *
 * The original note, still the reason for the number:
 *
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
const FALLBACK_DOT_HIT_SIZE = 24

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
    // Task 38, part 9: floor of the FRACTIONAL height, not `clientHeight`.
    // clientHeight is an integer, ROUNDED -- so a rail whose real height is
    // 748.5px reported 749, every dot was placed against a box half a pixel
    // taller than the one it lives in, and the bottommost dot's own box
    // ended half a pixel below the rail's true bottom edge. That edge is
    // the viewport's bottom edge (.exhibitions-layout is
    // `calc(100dvh - header-height)`), so half a pixel there is a scrollbar
    // on a page designed never to scroll -- and small enough that it does
    // not show up in a hunt for an element hanging past the fold, which is
    // exactly how it survived the previous fix. Flooring can only ever
    // under-report, which costs at most a pixel of unused rail and can
    // never overflow.
    const measure = () =>
      setHeight(Math.floor(el.getBoundingClientRect().height) || FALLBACK_RAIL_HEIGHT)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return height
}

/**
 * Task 37, part C1. A rough guess at the floating scrubber's own rendered
 * height (year line + title line + padding, see .exhibitions-timeline-scrub
 * in base.css), used only for the very first paint of a given activation --
 * before `useElementHeight` below has measured the real box -- and as the
 * jsdom fallback (no ResizeObserver there either). Close enough that a
 * first, unmeasured clamp still keeps the label roughly on-screen; the real
 * measurement takes over a frame later and never causes visible movement
 * for a normal one-line title, only for exceptionally long ones.
 */
const FALLBACK_SCRUB_HEIGHT = 44

/**
 * Task 38, part 1. The same kind of rough first-paint/jsdom guess as
 * FALLBACK_SCRUB_HEIGHT above, for a persistent year label
 * (.exhibitions-timeline-label: one line of var(--text-m) type at the body's
 * 1.6 line-height, plus 0.125rem of padding each side). Every year label is
 * the same height -- one line, always four digits -- so ONE measurement
 * (taken from whichever label renders first, see the ref below) governs all
 * of them, rather than a ref and an observer per label.
 */
const FALLBACK_LABEL_HEIGHT = 25

/** Measures `ref`'s own rendered height in real pixels, live -- the scrub
 * label's height changes with its content (a one-line vs. a wrapping title),
 * not just the viewport, so this re-measures on every resize of the element
 * itself, not only of the rail. Rounded UP (`Math.ceil`, not the integer
 * `offsetHeight` a browser would otherwise round to nearest), since
 * clampScrubTop's whole point is to guarantee the label's rendered box
 * never crosses the rail's own edges -- an UNDER-estimate of its height
 * would let the true (fractional, sub-pixel) box still poke past by a
 * fraction of a pixel, which is exactly the residual overflow a real
 * browser confirmed (see the task report) when this used `offsetHeight`.
 *
 * `mountKey` exists because the scrub label is only in the DOM at all while
 * `activeItem` is truthy (see its own conditional render below) -- `ref`
 * itself (a `useRef` object) never changes identity, so an effect keyed
 * only on `[ref, fallback]` would attach its ResizeObserver once, against
 * whatever `ref.current` happened to be (usually null) at that FIRST
 * mount, and never again -- confirmed against a real browser: the very
 * first reveal of a session used the fallback height forever, clamping
 * against a height that was never actually measured. The caller passes
 * `activeSlug` here, which changes every time the label's underlying DOM
 * node is torn down and recreated, forcing this effect (and its
 * ResizeObserver) to re-attach to the CURRENT node each time. */
function useElementHeight(ref, fallback, mountKey) {
  const [height, setHeight] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setHeight(Math.ceil(el.getBoundingClientRect().height) || fallback)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, fallback, mountKey])

  return height
}

/**
 * Task 38, part 1: shared by BOTH floating labels -- the scrubber and,
 * since this task, every persistent YEAR label. The year labels were the
 * remaining source of the page scroll this section is not supposed to have:
 * a dot's own hit box is inset from the rail's ends by half its size (see
 * DOT_HIT_SIZE above), but a year label is TALLER than a dot's hit box
 * (13px of type on a 1.6 line-height, plus padding, versus 24px), so the
 * oldest year's label -- centred on the bottommost dot, which sits exactly
 * DOT_HIT_SIZE/2 above the rail's own bottom edge -- still hung past that
 * edge by the difference. The rail's bottom edge IS the viewport's bottom
 * edge (.exhibitions-layout is `calc(100dvh - header-height)`, and nothing
 * in this section clips or scrolls by design), so even a fraction of a
 * pixel of overhang inflates the document and raises a scrollbar.
 *
 * Task 37, part C1. The scrubber label used to share a dot's own `top` and
 * `translateY(-50%)` centring unconditionally, which is exactly what let it
 * escape the viewport at the rail's own extremes: centred on the topmost
 * dot (top: 0, right under the header), its own upper half pokes above the
 * header's bottom edge; centred on the bottommost dot (top: near the rail's
 * full height, which IS the viewport's own bottom edge -- see
 * .exhibitions-layout's `height: calc(100dvh - header-height)`), its lower
 * half pokes past the bottom of the viewport, which (nothing here clips or
 * scrolls, by design -- see .exhibitions-timeline's own comment) inflates
 * the page's scrollHeight and forces exactly the scrollbar this whole rail
 * exists to avoid.
 *
 * Clamped here to the rail's own [0, railHeight] box instead: for a `top`
 * within half the label's own height of either edge, the label's near edge
 * is pinned to that edge (flush against it) rather than left to overflow
 * past it, using the SAME real, measured label height responsible for the
 * overflow in the first place (useElementHeight above) -- so this adapts
 * correctly to a long, two-line title's own taller box, not just the common
 * one-line case.
 */
function clampToRail(top, labelHeight, railHeight) {
  const half = labelHeight / 2
  if (railHeight <= labelHeight) return railHeight / 2
  return Math.min(Math.max(top, half), railHeight - half)
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
  const navigate = useNavigate()
  const railRef = useRef(null)
  const scrubRef = useRef(null)
  // The mobile year strip (see the `.exhibitions-timeline-years` list below).
  const yearsRef = useRef(null)
  // Task 38, part 1: attached to the FIRST year label only -- they are all
  // the same height (see FALLBACK_LABEL_HEIGHT), and one label mounts for
  // as long as any does, so a single observer answers for the whole set.
  const labelRef = useRef(null)
  // Task 38, part 9: attached to the first dot's own link. Every dot's hit
  // box is identical, so one measurement answers for all of them -- see
  // FALLBACK_DOT_HIT_SIZE for why this is measured rather than assumed.
  const dotRef = useRef(null)
  const height = useRailHeight(railRef)
  const groups = groupExhibitionsByYear(items)
  // Task 38, part 5: which years keep a label with no hover or focus at
  // all. Measured in YEARS, not in dots -- see persistentLabelYears for why
  // counting dots left two decades of the archive unlabelled.
  const persistentYears = persistentLabelYears(groups)
  const total = items?.length || 0
  const dotHitSize = useElementHeight(dotRef, FALLBACK_DOT_HIT_SIZE, total)
  const inset = dotHitSize / 2
  const usableHeight = Math.max(0, height - dotHitSize)
  const positions = layoutExhibitionsTimeline(items, { height: usableHeight, minGap: MIN_DOT_GAP }).map(
    (p) => p + inset
  )

  const [activeSlug, setActiveSlug] = useState(null)
  const activeIndex = activeSlug ? items.findIndex((item) => item.slug === activeSlug) : -1
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null
  const scrubHeight = useElementHeight(scrubRef, FALLBACK_SCRUB_HEIGHT, activeSlug)
  const labelHeight = useElementHeight(labelRef, FALLBACK_LABEL_HEIGHT, groups.length)

  // Whichever dot currently holds KEYBOARD focus (if any) within the rail --
  // shared by handleLeave below and the navigation effect further down, so
  // the two never answer "what's focused right now" two different ways.
  //
  // Task 38, part 3: `:focus-visible`, not plain `:focus`. A mouse click
  // focuses its target exactly as Tab does, so a plain focus test cannot
  // tell "this viewer is navigating by keyboard and needs the label" from
  // "this viewer just clicked a dot and the browser focused it on the way
  // out" -- and the label is a hover/keyboard affordance, so answering yes
  // to the second case is what left it hanging over the newly loaded page
  // with the pointer nowhere near the rail. `:focus-visible` is the
  // platform's own answer to that exact question, so it is asked rather
  // than re-derived from modality bookkeeping of our own. Guarded because a
  // selector engine that does not implement the pseudo-class throws on it
  // rather than returning false (jsdom's own nwsapi historically did);
  // falling back to "not keyboard focus" is the conservative answer, and
  // costs only the mouse-leave restore, never the label itself (onFocus
  // below sets it directly, unconditionally).
  const focusedSlug = () => {
    const el = railRef.current
    const focused = el && document.activeElement !== document.body && el.contains(document.activeElement)
      ? document.activeElement
      : null
    if (!focused) return null
    try {
      if (!focused.matches(':focus-visible')) return null
    } catch {
      return null
    }
    return focused.dataset.slug || null
  }

  // Restores the label to whichever dot currently holds keyboard focus (if
  // any) rather than always clearing on mouse-leave -- a sighted keyboard
  // user who tabs to a dot and then happens to wiggle the mouse off the
  // rail should not lose the label a moment later.
  const handleLeave = () => setActiveSlug(focusedSlug())

  // Task 37, part C2 (client feedback): a click navigates (Part B, above),
  // but `activeSlug` is this component's OWN state, and this component
  // itself never unmounts across an exhibition-to-exhibition navigation
  // (ExhibitionsLayout deliberately keeps the rail mounted -- see that
  // file) -- so with nothing to reset it, the label kept showing whatever
  // it showed the instant BEFORE the click, straight through onto the newly
  // loaded page. Cleared here whenever the CURRENT exhibition changes
  // (`currentSlug`, driven by the URL, updates the moment navigation
  // resolves, for a click or a keyboard Enter alike) -- restored from
  // focus, not simply blanked, since a mouse click focuses its target the
  // same way Tab + Enter does: the pointer is very likely still sitting
  // right over the rail it was just used to click, and that is a real,
  // common case (the brief's own words), not an edge case to leave dark
  // until the next pixel of movement.
  useEffect(() => {
    // Task 38, part 3: a pointer click clears the label outright rather than
    // restoring it from focus. See pointerNavRef below for why the two cases
    // have to be told apart here at all.
    const viaPointer = pointerNavRef.current
    pointerNavRef.current = false
    setActiveSlug(viaPointer ? null : focusedSlug())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug])

  // Task 38, part 3 (client feedback): true from the moment a POINTER click
  // starts a navigation until the effect above consumes it. A click is a
  // click whether it came from a mouse or from Enter on a focused link --
  // browsers dispatch both -- and `detail` is what separates them: the UI
  // Events spec defines it as the click count for a pointer-driven click
  // (1 and up) and browsers leave it at 0 for one synthesized from the
  // keyboard. The keyboard case must still restore the label (that viewer
  // has no pointer and the focused dot is the only thing telling them where
  // they are); the pointer case must not (the label is a hover affordance,
  // and leaving it up after the click is what the client saw as a tooltip
  // stuck over the newly loaded page).
  const pointerNavRef = useRef(false)

  // Brings the current year into view within the mobile strip. Roughly thirty
  // years scroll sideways in a box a few chips wide, and they run newest
  // first -- so an exhibition from 1998 is most of the archive off the left
  // edge, and without this the strip would open on 2024 with nothing to say
  // that the year you are actually looking at exists at all.
  //
  // The list's own `scrollLeft` is set directly rather than calling
  // `scrollIntoView`, which walks up the ancestor chain and scrolls whatever
  // else it finds on the way -- here that is the document, on a section built
  // never to scroll. This can only ever move the strip.
  //
  // Costs nothing on desktop, where the strip is `display: none`: every
  // measurement below reads 0 and the assignment is a no-op.
  useEffect(() => {
    const list = yearsRef.current
    const current = list?.querySelector('[aria-current="true"]')
    if (!list || !current) return
    const centred = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2
    list.scrollLeft = Math.max(0, centred)
    // `groups.length` belongs here as much as the year does. On a cold load
    // straight to an exhibition's URL the year is known from the URL itself
    // and is right on the very first render, while `items` is still being
    // fetched -- so this effect runs against an empty strip, finds no chip to
    // centre, and would never run again, because the year it is keyed on never
    // changes afterwards. Landing on /2013 left the strip showing the newest
    // years with the current one somewhere off the right-hand edge, which is
    // the exact failure it exists to prevent.
  }, [currentYear, groups.length])

  const handleMove = (e) => {
    if (!total) return
    const rect = railRef.current.getBoundingClientRect()
    const nearest = nearestIndexByY(positions, e.clientY - rect.top)
    setActiveSlug(items[nearest].slug)
  }

  // Task 37, part B: dots sit as little as MIN_DOT_GAP (10px) apart, but
  // each one's own clickable hit-box (DOT_HIT_SIZE, 24px) is far larger --
  // adjacent boxes overlap heavily, and whichever sibling is LATER in DOM
  // order paints on top and wins the hit-test. So a raw click on the rail
  // routinely lands on a different `<Link>` than the dot nearest the
  // pointer -- the one the floating label (handleMove above) just named.
  // Both must agree: the label is what the viewer reads as "where a click
  // goes", so a click has to land exactly there. Rather than trust
  // whichever overlapping box the browser's own hit-test picked, every
  // click is intercepted here and routed through the SAME nearest-by-Y
  // computation that drives the label, then navigated programmatically --
  // one mechanism, not two that can silently disagree.
  //
  // Only a plain left click with no modifier is intercepted: a modified
  // click (ctrl/cmd/shift/alt, or a non-primary button) is left to the
  // browser's own default -- open in a new tab, new window, etc. -- exactly
  // as any other link on the site, targeting whichever link the browser's
  // native hit-test actually resolved (unavoidable for a new-tab open, but
  // no worse than before this fix, and never the common case).
  //
  // Attached as a CAPTURE-phase listener (onClickCapture below), which runs
  // BEFORE the clicked `<Link>`'s own bubble-phase click handler -- calling
  // preventDefault() here is what stops that Link's own react-router
  // navigation (it checks event.defaultPrevented before navigating) from
  // ever firing, so exactly one navigation happens, to the computed target,
  // never a flash of the wrong page first.
  const handleClick = (e) => {
    if (!total) return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!e.target.closest('a')) return
    const rect = railRef.current.getBoundingClientRect()
    const nearest = nearestIndexByY(positions, e.clientY - rect.top)
    e.preventDefault()
    pointerNavRef.current = e.detail > 0
    navigate(href('article', items[nearest].slug))
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
        onClickCapture={handleClick}
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
                ref={i === 0 ? dotRef : undefined}
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

      {/*
        The mobile timeline: one tappable chip per YEAR, scrolling sideways
        under the header, instead of the dot rail above.

        A second list rather than a restyling of the first, because the two
        are not the same control wearing different clothes. The rail is 39
        dots placed by measured pixel offsets, carrying no text, spaced as
        little as 10px apart and read by pointing at a continuous axis; that
        is a fine thing to hover with a mouse and an impossible thing to hit
        with a thumb, and it has no meaning at all laid out horizontally --
        its labels are already switched off below 768px (see base.css) for
        exactly that reason, which left the mobile rail as 39 unlabelled,
        near-touching dots that said nothing about where they led. Chips say
        their year, are as wide as their own text, and there are fewer of them
        (roughly 30 years against 39 exhibitions). Exactly one of the two lists
        is ever displayed -- `display: none` removes the other from the
        accessibility tree along with the layout, so a screen reader is never
        offered both.

        Where a chip leads depends on how full its year is. Most years hold a
        single exhibition and go straight to it, which is what a viewer means
        by tapping a year. A year holding several (2013 holds five) goes to
        that year's own index instead -- `/2013`, an existing route that lists
        them (see ArticleDetail.jsx's YEAR_SLUG_RE fallback) -- rather than
        silently picking one of the five and leaving the other four with no
        way in. That is the whole reason this is grouped by year rather than
        being one chip per exhibition: five chips reading "2013" would say
        nothing about which was which.
      */}
      <ol className="exhibitions-timeline-years" ref={yearsRef}>
        {groups.map((group) => {
          const multi = group.items.length > 1
          const target = multi ? String(group.year) : group.items[0].slug
          const isCurrentGroup = group.year === currentYear
          return (
            <li key={group.year}>
              <Link
                to={href('article', target)}
                aria-current={isCurrentGroup ? 'true' : undefined}
                aria-label={
                  multi
                    ? `${group.year} \u2013 ${group.items.length} ${lang === 'fr' ? 'expositions' : 'exhibitions'}`
                    : undefined
                }
              >
                {group.year}
              </Link>
            </li>
          )
        })}
      </ol>

      {groups.map((group, index) => {
        const groupStartIndex = items.findIndex((item) => item.yearStart === group.year)
        const isCurrentGroup = group.year === currentYear
        // The current year is added here rather than inside
        // persistentLabelYears: it is a property of the page being viewed,
        // not of the archive's own shape.
        const isPersistent = isCurrentGroup || persistentYears.has(group.year)
        const className = [
          'exhibitions-timeline-label',
          isPersistent && 'is-persistent',
          isCurrentGroup && 'is-current-year',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <span
            key={group.year}
            ref={index === 0 ? labelRef : undefined}
            className={className}
            aria-hidden="true"
            style={{ top: `${clampToRail(positions[groupStartIndex], labelHeight, height)}px` }}
          >
            {group.year}
          </span>
        )
      })}

      {activeItem && (
        <div
          ref={scrubRef}
          className="exhibitions-timeline-scrub"
          aria-hidden="true"
          style={{ top: `${clampToRail(positions[activeIndex], scrubHeight, height)}px` }}
        >
          <span className="exhibitions-timeline-scrub-year">{activeItem.yearStart}</span>
          <span className="exhibitions-timeline-scrub-title">{activeItem.title}</span>
        </div>
      )}
    </nav>
  )
}
