import { lazy, Suspense, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { SEGMENTS } from './routes.js'
import { Header } from '@/components/Header.jsx'
import { Footer } from '@/components/Footer.jsx'
import { Home } from '@/pages/Home.jsx'
import { Works } from '@/pages/Works.jsx'
import { Exhibitions } from '@/pages/Exhibitions.jsx'
import { ArticleDetail } from '@/pages/ArticleDetail.jsx'
import { SimplePage } from '@/pages/SimplePage.jsx'
import { NotFound } from '@/pages/NotFound.jsx'

// Lazy: the admin editor's own code (and admin.css) must never ship in the
// public bundle. Only loaded when a visitor actually requests /admin.
const Admin = lazy(() => import('@/admin/Admin.jsx'))

// The complete public route table (Task 19).
//
// `onTranslatedPath` is threaded from each ArticleDetail route up to
// `<Header>` (as `translatedPath`) so that on an article page the FR/EN
// toggle points at that article's own counterpart slug rather than at the
// bare translated section. See Header.jsx's counterpartPath() for the
// fallback this wiring overrides.
function localizedRoutes(lang, onTranslatedPath) {
  const s = (key) => SEGMENTS[key][lang]
  return (
    <>
      <Route index element={<Home />} />
      <Route path={s('works')} element={<Works />} />
      <Route
        path={`${s('works')}/:slug`}
        element={<ArticleDetail routeKey="works" onTranslatedPath={onTranslatedPath} />}
      />
      <Route path={s('exhibitions')} element={<Exhibitions />} />
      <Route
        path={`${s('exhibitions')}/:slug`}
        element={<ArticleDetail routeKey="exhibitions" onTranslatedPath={onTranslatedPath} />}
      />
      <Route path={s('biography')} element={<SimplePage pageKey="biography" />} />
      <Route path={s('contact')} element={<SimplePage pageKey="contact" />} />
      <Route path={s('bibliography')} element={<SimplePage pageKey="bibliography" />} />
      <Route path={s('links')} element={<SimplePage pageKey="links" />} />
      <Route path={s('legal')} element={<SimplePage pageKey="legal" />} />
    </>
  )
}

export default function App() {
  const { pathname } = useLocation()
  const [translatedPath, setTranslatedPath] = useState(null)

  // Admin is its own branch, entirely apart from the public <Routes> tree
  // below: it owns absolute-path matching in its own internal <Routes> (see
  // Admin.jsx and Login.test.jsx, which renders <Admin/> standalone and
  // relies on that), and it never renders the public <Header>/<Footer>.
  // Checked first, before any public routing runs, so "/admin" can never be
  // swallowed as a French section slug by the "/" branch below (nesting it
  // as a <Route path="/admin/*"> inside the same <Routes> would strip the
  // "/admin" prefix before Admin's own absolute routes ever saw it).
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    )
  }

  return (
    <>
      <Header translatedPath={translatedPath} />
      <Routes>
        <Route path="/">{localizedRoutes('fr', setTranslatedPath)}</Route>
        <Route path="/en">{localizedRoutes('en', setTranslatedPath)}</Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </>
  )
}
