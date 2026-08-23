import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'

const LINKS = [
  { key: 'bibliography', fr: 'Bibliographie', en: 'Bibliography' },
  { key: 'links', fr: 'Liens', en: 'Links' },
  { key: 'legal', fr: 'Mentions légales', en: 'Terms and Conditions' },
]

// `indent`: Task 30 (client feedback). On exhibition pages the timeline
// reads as a full-height sidebar, so the footer's own content aligns to the
// content column beside its base rather than spanning the full width
// beneath both -- a CSS-only offset (base.css's .site-footer.is-exhibitions),
// not a change to where this component itself renders.
export function Footer({ indent = false } = {}) {
  const { lang, href } = useLang()

  return (
    <footer className={indent ? 'site-footer is-exhibitions' : 'site-footer'}>
      <nav aria-label={lang === 'fr' ? 'Pied de page' : 'Footer'}>
        {LINKS.map((item) => (
          <Link key={item.key} to={href(item.key)}>{item[lang]}</Link>
        ))}
      </nav>
      <p className="colophon">&copy; Philippe Gronon</p>
    </footer>
  )
}
