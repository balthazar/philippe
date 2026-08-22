import { Link } from 'react-router-dom'
import { useLang } from '../../lib/lang.jsx'

const LINKS = [
  { key: 'bibliography', fr: 'Bibliographie', en: 'Bibliography' },
  { key: 'links', fr: 'Liens', en: 'Links' },
  { key: 'legal', fr: 'Mentions légales', en: 'Terms and Conditions' },
]

export function Footer() {
  const { lang, href } = useLang()

  return (
    <footer className="site-footer">
      <nav aria-label={lang === 'fr' ? 'Pied de page' : 'Footer'}>
        {LINKS.map((item) => (
          <Link key={item.key} to={href(item.key)}>{item[lang]}</Link>
        ))}
      </nav>
      <p className="colophon">&copy; Philippe Gronon</p>
    </footer>
  )
}
