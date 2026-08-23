import { createContext, useContext, useEffect, useState } from 'react'

const PreloadContext = createContext({})

export function PreloadProvider({ value, children }) {
  return <PreloadContext.Provider value={value || {}}>{children}</PreloadContext.Provider>
}

/**
 * During prerender (and on first paint after hydration) the data is already
 * present, so no request is made and the markup contains real content. On any
 * later client navigation, or whenever the prerender did not preload this
 * key (Task 22 always passes an empty preload object today; per-route
 * preload data is a follow-up), it falls back to fetching.
 */
export function usePageData(key, fetcher) {
  const preloaded = useContext(PreloadContext)
  const [data, setData] = useState(preloaded[key] ?? null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (preloaded[key] !== undefined) {
      setData(preloaded[key])
      setError(null)
      return undefined
    }
    let cancelled = false
    setData(null)
    setError(null)
    fetcher()
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => { if (!cancelled) setError(err) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, error, loading: !data && !error }
}
