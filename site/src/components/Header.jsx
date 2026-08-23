import { NavLink, Link, useLocation } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { usePreloaded } from '@/preload.jsx'
import { routeFor, SEGMENTS } from '@/routes.js'

const NAV = [
  { key: 'works', fr: 'Œuvres', en: 'Works' },
  { key: 'exhibitions', fr: 'Expositions', en: 'Exhibitions' },
  { key: 'biography', fr: 'Biographie', en: 'Biography' },
  { key: 'contact', fr: 'Contact', en: 'Contact' },
]

/**
 * Maps the current path to its counterpart in the other language. Article
 * pages override this via the `translatedPath` prop when it's set, because
 * only the article knows its paired slug -- but that prop only ever gets
 * set from a client effect (ArticleDetail's usePageData + onTranslatedPath),
 * which never runs during SSR. `preloaded`, read from prerender/index.js's
 * preloadFor() via window.__PRELOAD__, is what lets this same function
 * return the correct counterpart synchronously, on the very first render,
 * server or client -- see PublicLayout/Header below for how it takes
 * priority over the `translatedPath` prop for exactly that reason.
 *
 * Task 27, Part A: articles live at the root now (/:slug, /en/:slug), so a
 * single-segment path is either a known section (SEGMENTS) or an article
 * slug -- there is no longer a nested "/section/slug" shape to parse.
 */
function counterpartPath(pathname, lang, otherLang, preloaded) {
  const stripped = lang === 'en' ? pathname.replace(/^\/en/, '') || '/' : pathname
  const [, first] = stripped.split('/')
  const key = Object.keys(SEGMENTS).find((k) => SEGMENTS[k][lang] === first)
  if (key) return routeFor(key, otherLang)
  if (!first) return routeFor('home', otherLang)
  // Not a known section: an article slug living at the root. Prefer the
  // preloaded counterpart (correct even when the fr/en slugs differ);
  // otherwise fall back to the same slug string under the other language.
  const preloadedPath = preloaded?.[`translatedPath:${first}:${lang}`]
  if (preloadedPath !== undefined) return preloadedPath
  return routeFor('article', otherLang, first)
}

const LANG_CODES = ['fr', 'en']

export function Header({ translatedPath }) {
  const { lang, otherLang, href } = useLang()
  const { pathname } = useLocation()
  // The whole preload object, not usePageData (which is keyed to a single,
  // statically-known key) -- counterpartPath needs to look up a key
  // computed from the current path, not fixed at the call site.
  const preloaded = usePreloaded()
  const toggleHref = translatedPath || counterpartPath(pathname, lang, otherLang, preloaded)

  return (
    <header className="site-header">
      {/*
        D1: .site-header itself stays full-bleed (its background must span
        the viewport at any width), but its content is capped and centred
        the same way .container is, so both align at any width above
        --container's 1440px instead of the header sitting 60px from the
        browser edge while the page content sits much further in.
      */}
      <div className="site-header-inner">
        <Link to={href('home')} className="wordmark">Philippe Gronon</Link>
        <nav aria-label={lang === 'fr' ? 'Navigation principale' : 'Main navigation'}>
          {NAV.map((item) => (
            <NavLink key={item.key} to={href(item.key)}>{item[lang]}</NavLink>
          ))}
        </nav>
        <div className="lang-switch" aria-label={lang === 'fr' ? 'Changer de langue' : 'Change language'}>
          {LANG_CODES.map((code) =>
            code === lang ? (
              <span key={code} className="lang-code active" aria-current="true">
                {code.toUpperCase()}
              </span>
            ) : (
              <Link key={code} to={toggleHref} className="lang-code" hrefLang={code}>
                {code.toUpperCase()}
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  )
}
