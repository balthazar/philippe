import { NavLink, Link, useLocation } from 'react-router-dom'
import { useLang } from '../../lib/lang.jsx'
import { routeFor, SEGMENTS } from '../../lib/routes.js'

const NAV = [
  { key: 'works', fr: 'Œuvres', en: 'Works' },
  { key: 'exhibitions', fr: 'Expositions', en: 'Exhibitions' },
  { key: 'biography', fr: 'Biographie', en: 'Biography' },
  { key: 'contact', fr: 'Contact', en: 'Contact' },
]

/**
 * Maps the current path to its counterpart in the other language. Article
 * pages override this via the `translatedPath` prop, because only the article
 * knows its paired slug.
 */
function counterpartPath(pathname, lang, otherLang) {
  const stripped = lang === 'en' ? pathname.replace(/^\/en/, '') || '/' : pathname
  const [, segment, slug] = stripped.split('/')
  const key = Object.keys(SEGMENTS).find((k) => SEGMENTS[k][lang] === segment)
  return key ? routeFor(key, otherLang, slug) : routeFor('home', otherLang)
}

const LANG_CODES = ['fr', 'en']

export function Header({ translatedPath }) {
  const { lang, otherLang, href } = useLang()
  const { pathname } = useLocation()
  const toggleHref = translatedPath || counterpartPath(pathname, lang, otherLang)

  return (
    <header className="site-header">
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
    </header>
  )
}
