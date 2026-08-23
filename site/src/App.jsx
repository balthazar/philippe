import { lazy, Suspense, useState } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
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

// A layout route: wraps only the public branches below it in the public
// chrome, via <Outlet/>. /admin (a sibling route, not nested under this
// one) never passes through here, so it never renders <Header>/<Footer>.
function PublicLayout({ translatedPath }) {
  return (
    <>
      <Header translatedPath={translatedPath} />
      <Outlet />
      <Footer />
    </>
  )
}

export default function App() {
  const [translatedPath, setTranslatedPath] = useState(null)

  return (
    <Routes>
      {/*
        Ordered first (React Router ranks explicit static segments over a
        "/" index/param branch regardless of order, but first is also
        clearest): /admin owns its own absolute-vs-relative route context
        via this real <Route>, so Admin.jsx's own <Routes> can use ordinary
        relative paths (index, articles/new, ...), the same as every other
        route table in this app. It is a sibling of the public layout route
        below, not nested under it, so it never renders the public chrome.
      */}
      <Route path="/admin/*" element={<Suspense fallback={null}><Admin /></Suspense>} />
      <Route element={<PublicLayout translatedPath={translatedPath} />}>
        <Route path="/">{localizedRoutes('fr', setTranslatedPath)}</Route>
        <Route path="/en">{localizedRoutes('en', setTranslatedPath)}</Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
