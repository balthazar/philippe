import { useEffect, useState } from 'react'

/**
 * Trails `value` by `delay`, resetting the wait on every change, so a fast
 * typist produces one settled value rather than one per keystroke.
 *
 * The caller keeps the raw value for the input itself and uses this one for
 * the expensive work: the field stays perfectly responsive (an input driven
 * by a debounced value drops characters), while whatever the value feeds --
 * here, re-filtering and re-rendering the whole media library, five hundred
 * items with a thumbnail each -- happens once the typing stops.
 */
export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
