import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useLang } from './lib/lang.jsx'
import { SEGMENTS } from './lib/routes.js'
import { Header } from './public-site/components/Header.jsx'
import { Footer } from './public-site/components/Footer.jsx'
import { Works } from './public-site/pages/Works.jsx'
import { ArticleDetail } from './public-site/pages/ArticleDetail.jsx'

// Scaffold only (Task 14/15). Task 15 adds the chrome (Header/Footer) around
// this route table so it can be verified in the browser; Tasks 16-19 add the
// real pages and replace the route table wholesale. Kept intentionally
// minimal so it never imports a page component that doesn't exist yet.
//
// The 'works' route below is wired to the real Works page (Task 16) purely
// so it can be checked in a browser against the live API. Task 19 rewrites
// this route table wholesale.

function ScaffoldPage({ label }) {
  const { lang } = useLang()
  return (
    <p>
      {label} ({lang})
    </p>
  )
}

// `onTranslatedPath` is threaded through only so this scaffold can verify,
// in the browser, that an article page steers the header's language toggle
// to its own counterpart. Task 19 rewrites this route table wholesale and
// owns the real version of this wiring.
function localizedRoutes(lang, onTranslatedPath) {
  const s = (key) => SEGMENTS[key][lang]
  return (
    <>
      <Route index element={<ScaffoldPage label="Home" />} />
      <Route path={s('works')} element={<Works />} />
      <Route
        path={`${s('works')}/:slug`}
        element={<ArticleDetail routeKey="works" onTranslatedPath={onTranslatedPath} />}
      />
      <Route path={s('exhibitions')} element={<ScaffoldPage label="Exhibitions" />} />
      <Route
        path={`${s('exhibitions')}/:slug`}
        element={<ArticleDetail routeKey="exhibitions" onTranslatedPath={onTranslatedPath} />}
      />
      <Route path={s('biography')} element={<ScaffoldPage label="Biography" />} />
      <Route path={s('contact')} element={<ScaffoldPage label="Contact" />} />
      <Route path={s('bibliography')} element={<ScaffoldPage label="Bibliography" />} />
      <Route path={s('links')} element={<ScaffoldPage label="Links" />} />
      <Route path={s('legal')} element={<ScaffoldPage label="Legal" />} />
    </>
  )
}

export default function App() {
  const [translatedPath, setTranslatedPath] = useState(null)
  return (
    <>
      <Header translatedPath={translatedPath} />
      <Routes>
        <Route path="/">{localizedRoutes('fr', setTranslatedPath)}</Route>
        <Route path="/en">{localizedRoutes('en', setTranslatedPath)}</Route>
        <Route path="*" element={<p>404</p>} />
      </Routes>
      <Footer />
    </>
  )
}
