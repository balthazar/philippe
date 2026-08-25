import { createContext, useContext, useEffect, useState } from 'react'

const PreloadContext = createContext({})

/**
 * Everything usePageData has already fetched this session, keyed exactly as
 * its callers key it.
 *
 * Without it, every navigation dropped the page's data to null, painted the
 * empty aria-busy placeholder, and fetched the same thing again -- so going
 * back to a page you had just left was as slow and as blank as seeing it for
 * the first time, and the exhibitions rail blinked out and refetched all 39
 * items whenever its own key changed. React was keeping the chrome mounted
 * the whole time; it was the DATA under it that kept being thrown away.
 *
 * Module-level, not React state, so it survives the unmount/remount of any
 * component that reads it. Lives for the session: a reload clears it, which
 * is the right granularity for an archive whose content changes a few times
 * a week and is edited in a different tab from the one reading it.
 *
 * Only ever holds resolved values. A rejection is not cached -- a 404 for a
 * legacy year URL is load-bearing (ArticleDetail turns it into that year's
 * listing) but a network failure must stay retryable, and the two are not
 * worth telling apart here.
 */
const cache = new Map()

/** Test seam: the cache is module state, so a test that mounts twice needs to clear it. */
export function clearPageDataCache() {
  cache.clear()
}

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
 * 22; read via usePreloaded() below, by Header, not usePageData --
 * see preloadFor() there for why). Preloading full page content (article
 * bodies, archive listings) the same way remains a deliberate follow-up,
 * not done here.
 */
export function usePageData(key, fetcher) {
  const preloaded = useContext(PreloadContext)
  const initial = (k) => preloaded[k] ?? cache.get(k) ?? null
  const [state, setState] = useState(() => ({ key, data: initial(key), error: null }))

  // Derived synchronously on a key change instead of waiting for the effect
  // below to reset it. React commits the render that follows a key change
  // BEFORE effects run, so holding data in plain state hands every consumer
  // the previous key's value for one extra render. That is not theoretical:
  // navigating from one article to another briefly painted the previous
  // article's language-toggle href onto the new article's page. Resetting
  // here also clears a stale error, so a slug change from one that 404s to
  // one that exists no longer stays stuck on "not found".
  //
  // The cache is consulted here, in the same synchronous derivation, so a
  // key change to something already fetched renders it on that very commit:
  // no placeholder frame, no flash, nothing to fade back in.
  const current = state.key === key
    ? state
    : { key, data: initial(key), error: null }

  useEffect(() => {
    if (preloaded[key] !== undefined) {
      setState({ key, data: preloaded[key], error: null })
      return undefined
    }
    // Already fetched: nothing to do. `current` above is already rendering
    // it, so re-fetching would only replace it with an identical value.
    if (cache.has(key)) {
      setState({ key, data: cache.get(key), error: null })
      return undefined
    }
    let cancelled = false
    setState({ key, data: null, error: null })
    fetcher()
      .then((result) => {
        // Cached even if this component has since navigated away: the work
        // is done, and the next visit should have it.
        if (result != null) cache.set(key, result)
        if (!cancelled) setState({ key, data: result, error: null })
      })
      .catch((err) => { if (!cancelled) setState({ key, data: null, error: err }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data: current.data, error: current.error, loading: !current.data && !current.error }
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
