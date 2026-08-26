/*
 * Named `measurement.js`, not `analytics.js`, and that is load-bearing rather
 * than a matter of taste. Content blockers filter by URL PATH, and the common
 * privacy lists carry a generic rule for `analytics.js` -- so a browser with
 * one installed refused this exact request. The Vite dev server serves every
 * source file at its own URL, App.jsx imports this module statically, and one
 * refused module takes the whole graph down with it: the page loaded, Vite's
 * own client connected, and React never mounted at all. A production build
 * inlines a statically-imported module into the hashed main chunk, so the name
 * never reaches a URL there and the public site was never affected -- this was
 * only ever a way to make local development impossible for whoever ran a
 * blocker. GA4's own term for the ID below is a "measurement ID", so the file
 * is named for what it holds.
 *
 * The third-party gtag script IS blocked by those same lists, in dev and in
 * production alike, and always has been. That is the visitor's call and costs
 * nothing here: loadGtag() defines window.gtag itself before appending the
 * script, so every call below pushes onto dataLayer whether the script ever
 * arrives or not, and a blocked one is silently a no-op.
 */
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * The GA4 property for philippegronon.com. A measurement ID is a public
 * identifier -- it ships in the page source of every site that uses one --
 * so it lives here as a constant rather than as a build-time secret.
 */
export const GA_MEASUREMENT_ID = 'G-FQ6T71HRZ1'

const SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`

/**
 * The admin is a lazy route inside this same SPA (/admin/*, see App.jsx), so
 * it shares the public bundle's HTML shell. Left alone it would report the
 * artist editing his own site as traffic, and every article he opened in the
 * editor as a page view of that article. Nothing here loads on /admin at all:
 * not the tag, not a page view, not the third-party request.
 */
const isAdmin = (pathname) => pathname === '/admin' || pathname.startsWith('/admin/')

function gtag() {
  // The real gtag is `function(){dataLayer.push(arguments)}` -- arguments,
  // not an array of them, which is why this can't be an arrow function and
  // can't spread.
  window.dataLayer.push(arguments)
}

function loadGtag() {
  if (window.gtag) return
  window.dataLayer = window.dataLayer || []
  window.gtag = gtag
  gtag('js', new Date())
  // send_page_view: false because this is a single-page app. gtag's own
  // automatic page view fires once, on script load, and never again -- every
  // client-side navigation after it would go unrecorded. The hook below
  // sends one per route instead, including the first.
  gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })

  const script = document.createElement('script')
  script.async = true
  script.src = SRC
  document.head.appendChild(script)
}

/**
 * Reports one GA4 page view per route.
 *
 * Mounted once, in App. The title is read at send time rather than passed in
 * because usePageTitle sets document.title from each page's own loaded data,
 * which can land a tick after the route changes; reading it here keeps this
 * hook from having to know anything about how a title is built.
 */
export function useAnalytics() {
  const { pathname, search } = useLocation()
  // React 18 StrictMode mounts effects twice in development. Without this,
  // every navigation would report two views of the same page.
  const lastSent = useRef(null)

  useEffect(() => {
    if (import.meta.env.DEV) return
    if (isAdmin(pathname)) return

    const path = `${pathname}${search}`
    if (lastSent.current === path) return
    lastSent.current = path

    loadGtag()
    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    })
  }, [pathname, search])
}
