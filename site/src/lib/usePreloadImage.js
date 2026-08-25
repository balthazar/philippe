import { useEffect } from 'react'

/**
 * Warms the browser cache for one image URL.
 *
 * Extracted from Slideshow.jsx, where it was written to fix a specific
 * symptom: the fade-in starts the instant the displayed image changes, so an
 * image that has not been fetched yet fades in as a blank rectangle and then
 * pops in when it arrives, which reads as a transition interrupted midway.
 * These are the 2400px `large` variants, 130-250KB each, so on a cold cache
 * that gap is easily longer than the 300ms fade.
 *
 * It lived only on the homepage, which is exactly the drift useCrossfade.js
 * was extracted to end: the gallery slider shares the fade machinery but had
 * none of the preloading around it, and showed the blank-rectangle symptom
 * on every single transition. Shared now, so there is one place to fix.
 *
 * Keyed on the URL rather than on an index and a list, so it re-runs when
 * (and only when) the thing being preloaded actually changes. Pass a falsy
 * url to preload nothing, which is what a single-image slider wants.
 */
export function usePreloadImage(url) {
  useEffect(() => {
    if (!url) return undefined
    const preload = new Image()
    preload.src = url
    // Abandons the fetch if this unmounts (or the url changes) before it
    // lands, rather than leaving it to complete against a dead component.
    return () => { preload.src = '' }
  }, [url])
}
