import { useLayoutEffect, useRef } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js'

/** Kept in sync by hand with nothing: this is the only definition of the page fade. */
export const CONTENT_FADE_MS = 260

/**
 * Fades an element's content in whenever `dependency` changes, without
 * remounting it.
 *
 * That last part is the whole reason this is not a CSS animation. A CSS
 * animation runs when the element carrying it appears, so re-running it means
 * replacing the element -- and the elements that want this fade are exactly
 * the ones that must NOT be replaced. Keying the exhibitions content column
 * per article would remount `<Outlet/>` beneath it, and ArticleDetail's
 * unmount cleanup reports `onExhibitionsLayout(false)`, which flickers the
 * 39-dot rail off and on between every pair of exhibitions. The first
 * attempt at this fade avoided that by not keying at all, which was correct
 * about the rail and useless as a fade: it ran once on entering the section
 * and never again, so navigating between exhibitions stayed a hard cut.
 *
 * The Web Animations API has no such constraint. It animates a live element
 * on demand, as many times as asked, so the node stays exactly where it is
 * and the fade still runs on every navigation.
 *
 * `useLayoutEffect`, so the animation is scheduled before the browser paints
 * the new content: with `fill: 'backwards'` the element already holds the
 * animation's first keyframe (opacity 0) at that point, and there is no
 * frame of fully-opaque content flashing in before the fade starts.
 *
 * Cancelled on cleanup so a navigation that lands mid-fade restarts cleanly
 * rather than layering a second animation over the first.
 *
 * ONE requirement on the caller: `dependency` must not change while the
 * element is unmounted, or the fade is simply skipped. A component that
 * returns a loading placeholder before its content has no element for the
 * ref at the moment the key changes, the effect runs against a null ref, and
 * nothing re-runs it when the content finally appears. Such a caller should
 * pass `null` while loading and its real key once it has something to show,
 * so the change the effect sees is the one where the element exists. */
export function useContentFade(dependency) {
  const ref = useRef(null)
  const reduced = usePrefersReducedMotion()

  useLayoutEffect(() => {
    const element = ref.current
    // `animate` is missing in jsdom, and in any browser old enough not to
    // have the Web Animations API. Both should get the content, just without
    // the fade -- so this is a guard, not a polyfill.
    if (!element || reduced || typeof element.animate !== 'function') return undefined

    const animation = element.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: CONTENT_FADE_MS, easing: 'ease-out', fill: 'backwards' }
    )
    return () => animation.cancel()
  }, [dependency, reduced])

  return ref
}
