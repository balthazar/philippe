import { useEffect, useRef, useState } from 'react'

/**
 * Task 35, Part A: fade-through-white for a single, persistent element --
 * the rewrite that replaces the four-patch, two-image-element mechanism
 * this hook's own git history shows layered onto Slideshow.jsx (and
 * duplicated into GallerySlider.jsx). See the task report for the full
 * account of why.
 *
 * The client's own settled design (fade through white, not a crossfade):
 * the outgoing image reaches zero opacity before the incoming one appears,
 * so the two are never visible at once. Given that, a SECOND image element
 * was never actually necessary -- one element, never unmounted, whose `src`
 * changes while it is invisible, does the exact same job with none of the
 * bugs that came from managing two nodes' identities across remounts.
 *
 * Call shape: `target` is whatever the caller wants displayed right now
 * (the current slide/item, changing on every click or timer tick). This
 * hook returns `{ displayed, visible }` -- `displayed` is what the caller
 * should actually render (its `src`, `alt`, etc.); it lags `target` by one
 * fade-out while a transition is in flight. `visible` is a boolean the
 * caller turns into a CSS class (e.g. `is-hidden` when false): the
 * stylesheet owns the actual opacity transition and its duration/easing per
 * direction (see base.css -- a different `transition` value applies
 * depending on which class is present, the standard way to get an
 * asymmetric fade-out/fade-in duration from one property).
 *
 * State machine, in full:
 *   - `target === displayed`: at rest, nothing to do.
 *   - `target !== displayed` and no fade in flight: start one -- flip
 *     `visible` to false (fade the CURRENTLY DISPLAYED element toward
 *     opacity 0) and arm a timeout for `fadeOutMs`.
 *   - When that timeout fires: `displayed` becomes whatever `target` is by
 *     THEN (read from a ref, never a stale closure), and `visible` flips
 *     back to true, fading the (now possibly different) element back in.
 *
 * Rapid navigation needs no special handling, which is the whole point of
 * this design:
 *   - A click that arrives while a fade-out is already in flight only ever
 *     updates `target` (via a fresh render with a new `target` prop) --
 *     this effect sees `fadingRef.current === true` and does nothing. The
 *     ALREADY-SCHEDULED timeout is what eventually reads the latest target
 *     and lands on it, skipping any intermediate targets a burst passed
 *     through. No new timer, no reset, no remount.
 *   - If that burst's NET target lands back on what is already displayed
 *     (e.g. next, then prev, inside the fade-out window), the guard above
 *     (`target === displayed`) is false while displayed is still the OLD
 *     value (the fade-out hasn't completed yet) -- so this still correctly
 *     falls through to "a fade is already in flight, nothing to do here",
 *     and the pending timeout, when it fires, sets displayed back to that
 *     same value and fades back in. The image keeps fading through white
 *     and settles back on itself -- never an instant snap -- with no
 *     special-cased "am I reversing?" branch anywhere in this file.
 *   - An interrupting change during the FADE-IN half (visible already back
 *     to true, `displayed` already updated) is not "in flight" by this
 *     hook's own bookkeeping (`fadingRef.current` is false again), so it
 *     starts a fresh fade-out immediately -- CSS itself retargets the
 *     opacity transition from wherever it currently sits, with no jump.
 */
export function useCrossfade(target, { reduced = false, fadeOutMs = 300 } = {}) {
  const [displayed, setDisplayed] = useState(target)
  const [visible, setVisible] = useState(true)
  const targetRef = useRef(target)
  const fadingRef = useRef(false)
  const timeoutRef = useRef(null)

  targetRef.current = target

  useEffect(() => {
    if (reduced) {
      // No fade, ever: land on the latest target immediately, and cancel a
      // fade that happened to be in flight when reduced motion took effect.
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      fadingRef.current = false
      setDisplayed(target)
      setVisible(true)
      return undefined
    }

    if (target == null || target === displayed) return undefined
    if (fadingRef.current) return undefined // a fade is already in flight; its own pending timeout (below) will pick up the latest target when it fires

    fadingRef.current = true
    setVisible(false)

    timeoutRef.current = setTimeout(() => {
      setDisplayed(targetRef.current)
      setVisible(true)
      fadingRef.current = false
      timeoutRef.current = null
    }, fadeOutMs)

    return undefined
  }, [target, displayed, reduced, fadeOutMs])

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  return { displayed, visible }
}
