import { useEffect } from 'react'

/**
 * Coordinator feedback (task 27): the prerender computed `<title>` text
 * correctly, but nothing ever set `document.title` at runtime -- the dev
 * server, the tab after hydration, and every client-side navigation all
 * showed no title (or, worse, the previous route's title stuck in
 * production, since navigating never touched it again).
 *
 * `title` is the final, already-formatted string (built via
 * `src/lib/pageTitle.js`'s pure helpers -- the exact same ones
 * prerender/index.js's headFor() uses, so the two formats cannot drift
 * apart). Pass `undefined`/`null`/`''` while the page's own data hasn't
 * loaded yet, and the previous route's title is left alone rather than
 * being blanked out -- the same "no flash of missing content" reasoning
 * this project already applies to loading states elsewhere.
 */
export function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
