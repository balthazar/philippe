import { useEffect, useState } from 'react'

/**
 * Shared with Slideshow.jsx and ExhibitionsTimeline.jsx (task 29, part 4):
 * one definition of "does this visitor want reduced motion" instead of a
 * per-component copy that could drift.
 */
export function usePrefersReducedMotion() {
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
