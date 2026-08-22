import { Routes, Route, Link } from 'react-router-dom'
import { useLang } from './lib/lang.jsx'
import { SEGMENTS } from './lib/routes.js'

// Scaffold only (Task 14). Task 15 adds Header/Footer, Tasks 16-19 add the
// real pages and replace this route table wholesale. Kept intentionally
// minimal so it never imports a component that doesn't exist yet.

function ScaffoldPage({ label }) {
  const { lang } = useLang()
  return (
    <p>
      {label} ({lang})
    </p>
  )
}

function localizedRoutes(lang) {
  const s = (key) => SEGMENTS[key][lang]
  return (
    <>
      <Route index element={<ScaffoldPage label="Home" />} />
      <Route path={s('works')} element={<ScaffoldPage label="Works" />} />
      <Route path={s('exhibitions')} element={<ScaffoldPage label="Exhibitions" />} />
      <Route path={s('biography')} element={<ScaffoldPage label="Biography" />} />
      <Route path={s('contact')} element={<ScaffoldPage label="Contact" />} />
      <Route path={s('bibliography')} element={<ScaffoldPage label="Bibliography" />} />
      <Route path={s('links')} element={<ScaffoldPage label="Links" />} />
      <Route path={s('legal')} element={<ScaffoldPage label="Legal" />} />
    </>
  )
}

export default function App() {
  const { lang, otherLang, href } = useLang()
  return (
    <div>
      <nav>
        <Link to={href('home')}>{lang === 'fr' ? 'Accueil' : 'Home'}</Link>
        {' | '}
        <Link to={otherLang === 'en' ? '/en' : '/'}>{otherLang === 'en' ? 'English' : 'Français'}</Link>
      </nav>
      <Routes>
        <Route path="/">{localizedRoutes('fr')}</Route>
        <Route path="/en">{localizedRoutes('en')}</Route>
        <Route path="*" element={<p>404</p>} />
      </Routes>
    </div>
  )
}
