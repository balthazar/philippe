import { useEffect } from 'react'

/**
 * Publishes the header's real, rendered height to the document as
 * `--header-space` (see tokens.css for the token this overrides and for the
 * distinction from `--header-height`).
 *
 * The header used to be a fixed 5rem bar at every width, so every rule that
 * needed "the viewport minus the header" could simply subtract the token that
 * set it. That stopped being true the moment the nav was allowed to wrap onto
 * its own row on mobile: the header's height there is a function of the
 * viewport width, of which language is showing (BIO / BIBLIOGRAPHIE and BIO /
 * BIBLIOGRAPHY do not wrap at the same width), and of the visitor's own root
 * font size. There is no number that can be written into a media query and be
 * right for all three, and a wrong one is not cosmetic: the homepage
 * slideshow is `calc(100dvh - <that number>)`, so an underestimate raises a
 * scrollbar on the one page that is meant to be exactly one viewport tall,
 * and an overestimate leaves a band of white beneath the photograph.
 *
 * So it is measured rather than assumed -- the same choice, for the same
 * reason, that the exhibitions rail already makes for its own height (see
 * useRailHeight in ExhibitionsTimeline.jsx).
 *
 * Written to `document.documentElement` rather than kept in React state: the
 * consumers are all CSS rules on elements this hook's caller does not own
 * (`.slideshow`, `.category-section h2`, `.exhibitions-layout`), and an inline
 * custom property on <html> reaches every one of them without threading a
 * number through the tree. Nothing here reads it back, so there is no loop:
 * `.site-header`'s own height comes from `--header-height` on desktop and
 * from its content on mobile, never from this.
 *
 * Rounded UP. The two are half a pixel apart at most, but they fail
 * differently: over-reporting costs a sub-pixel sliver of white under the
 * slideshow, where under-reporting makes the page one pixel taller than the
 * viewport and raises a scrollbar. The rail's own measurement floors for the
 * mirror image of this reason -- there the measured box is what things are
 * placed INSIDE, so under-reporting is the safe direction.
 */
export function useHeaderSpace(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const root = document.documentElement
    const measure = () => {
      const height = el.getBoundingClientRect().height
      if (height) root.style.setProperty('--header-space', `${Math.ceil(height)}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
      // Back to the token's own fallback rather than leaving the last
      // measured value stranded on <html>: this hook unmounts with the public
      // header, and /admin (a lazy route inside this same bundle, with a
      // header of its own) must not inherit a number measured from it.
      root.style.removeProperty('--header-space')
    }
  }, [ref])
}
