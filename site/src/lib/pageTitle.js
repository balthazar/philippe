// Coordinator feedback (task 27): the prerender computed `<title>` text
// correctly, but nothing at runtime ever set `document.title` -- so the
// dev server, the tab after hydration, and every client-side navigation
// all showed no title (or, worse in production, the PREVIOUS route's
// prerendered title, stuck). This module is the one shared source for that
// text: prerender/index.js's headFor() and the runtime's usePageTitle()
// hook both call it, so the two formats cannot drift apart.
//
// Deliberately framework- and DOM-free (no React, no `document`): this file
// is imported directly by prerender/index.js, a plain Node script that
// runs at build time, long before there is any DOM to touch.
export const SITE_NAME = 'Philippe Gronon'

// D4: the home route's title is literally "Philippe Gronon", never
// suffixed -- every other route gets the " | Philippe Gronon" form below.
export const HOME_TITLE = SITE_NAME

/** An article page's title: its own title, its year label if it has one, and the site name. */
export function articlePageTitle(title, year) {
  const base = year ? `${title}, ${year}` : title
  return `${base} | ${SITE_NAME}`
}

/**
 * A static or section page's title (biography, works, contact, ...): its own
 * title and the site name.
 *
 * An untitled page falls back to the bare site name rather than the
 * suffix on its own. A `Page` document's `title` is a localizedField, which
 * defaults to '' -- and the exhibitions page in production carries exactly
 * that, so /expositions shipped with a literal `<title> | Philippe Gronon</title>`.
 * The runtime hid this: Exhibitions.jsx guarded its own call
 * (`title && staticPageTitle(title)`), so the tab kept the previous route's
 * title instead of showing the broken one, while the PRERENDERED head -- the
 * one crawlers read -- had no such guard. Two call sites disagreeing about
 * what an empty title means is exactly the drift this module exists to
 * prevent, so the answer lives here, once, where both of them already are.
 */
export function staticPageTitle(title) {
  return title ? `${title} | ${SITE_NAME}` : SITE_NAME
}
