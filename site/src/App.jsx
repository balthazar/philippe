import { lazy, Suspense, useState } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
import { SEGMENTS } from './routes.js'
import { Header } from '@/components/Header.jsx'
import { Home } from '@/pages/Home.jsx'
import { Works } from '@/pages/Works.jsx'
import { Exhibitions } from '@/pages/Exhibitions.jsx'
import { ArticleDetail } from '@/pages/ArticleDetail.jsx'
import { SimplePage } from '@/pages/SimplePage.jsx'
import { NotFound } from '@/pages/NotFound.jsx'
import { ExhibitionsLayout } from '@/components/ExhibitionsLayout.jsx'
import { useAnalytics } from '@/lib/analytics.js'

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
function localizedRoutes(lang, onTranslatedPath, onExhibitionsLayout, isExhibitionsArticle) {
  const s = (key) => SEGMENTS[key][lang]
  return (
    <>
      <Route index element={<Home />} />
      <Route path={s('works')} element={<Works />} />
      {/*
        Task 32, item 1: the exhibitions index and every article slug share
        this one layout route so the timeline rail it renders mounts once
        and never unmounts while navigating between them (see
        ExhibitionsLayout.jsx). `:slug` still matches a work article too --
        works and exhibitions share one flat slug namespace (Task 27, Part
        A) -- the layout itself renders a bare `<Outlet/>` for those,
        identical to before this task.

        React Router ranks a static segment (e.g. /contact, below) over a
        dynamic one (:slug) regardless of declaration order, so grouping
        :slug here with the exhibitions index -- ahead of the other named
        sections -- does not risk a section path resolving as an article
        slug instead of its own page.
      */}
      <Route element={<ExhibitionsLayout isExhibitionsArticle={isExhibitionsArticle} />}>
        <Route path={s('exhibitions')} element={<Exhibitions />} />
        <Route
          path=":slug"
          element={<ArticleDetail onTranslatedPath={onTranslatedPath} onExhibitionsLayout={onExhibitionsLayout} />}
        />
      </Route>
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
// one) never passes through here, so it never renders <Header>.
//
// Task 33: the footer that used to render here is retired outright (its
// links moved to /contact -- see SimplePage.jsx). That also removes the two
// things this component used to compute only to feed it: `isHome` (was it
// the homepage, so the footer could be dropped) and `isExhibitionsSection`
// (was it /expositions, so the footer could be indented) are both gone; the
// route tree and everything else below is unchanged.
function PublicLayout({ translatedPath }) {
  return (
    <div className="site-shell">
      <Header translatedPath={translatedPath} />
      <Outlet />
    </div>
  )
}

export default function App() {
  const [translatedPath, setTranslatedPath] = useState(null)
  const [isExhibitionsArticle, setIsExhibitionsArticle] = useState(false)

  // One GA4 page view per route. Mounted here rather than in PublicLayout so
  // /404 and any future route outside the public chrome is still counted;
  // /admin is excluded inside the hook itself, not by where it is called.
  useAnalytics()

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
        <Route path="/">{localizedRoutes('fr', setTranslatedPath, setIsExhibitionsArticle, isExhibitionsArticle)}</Route>
        <Route path="/en">{localizedRoutes('en', setTranslatedPath, setIsExhibitionsArticle, isExhibitionsArticle)}</Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
