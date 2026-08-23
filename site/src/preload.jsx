import { createContext, useContext, useEffect, useState } from 'react'

const PreloadContext = createContext({})

export function PreloadProvider({ value, children }) {
  return <PreloadContext.Provider value={value || {}}>{children}</PreloadContext.Provider>
}

/**
 * During prerender (and on first paint after hydration) the data is already
 * present, so no request is made and the markup contains real content. On any
 * later client navigation, or whenever the prerender did not preload this
 * key, it falls back to fetching.
 *
 * Today prerender/index.js only preloads one thing this way: an article
 * page's own-language <-> other-language translatedPath (Fix round 1, Task
 * 22; read via usePreloadedValue() below, by Header, not usePageData --
 * see preloadFor() there for why). Preloading full page content (article
 * bodies, archive listings) the same way remains a deliberate follow-up,
 * not done here.
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

/**
 * Reads the whole preload object straight from context, synchronously, with
 * no fetch fallback: for a value that must be correct on the very first
 * render (server and client alike) or not used at all, rather than one
 * that's fine to show a moment late while an effect fetches it. Header's
 * language-toggle href is the one caller today (Fix round 1, Task 22),
 * where the exact key to look up depends on the current path and isn't
 * known statically, so it reads the whole object rather than one fixed key.
 * Consulting this before falling back to its own guess is what makes the
 * link right in the raw prerendered HTML, not just after a post-hydration
 * effect corrects it.
 */
export function usePreloaded() {
  return useContext(PreloadContext)
}
