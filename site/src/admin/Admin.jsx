import { useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { Login } from './Login.jsx'
import { ArticleList } from './ArticleList.jsx'
import { ArticleEditor } from './ArticleEditor.jsx'
import { MediaLibrary } from './MediaLibrary.jsx'
import { PageEditor } from './PageEditor.jsx'
import { PagesIndex } from './PagesIndex.jsx'
import { SessionExpiredProvider } from './session.js'
import './admin.css'

function AdminNotFound() {
  return (
    <div className="admin-not-found">
      <p>Page introuvable.</p>
    </div>
  )
}

export default function Admin() {
  const { user, loading, login, logout, clearSession } = useAuth()
  const navigate = useNavigate()
  // Task 28, client feedback: reported up by whichever editor route is
  // currently mounted (ArticleEditor's own onUnsavedCountChange prop,
  // mirroring ArticleDetail's onTranslatedPath -> Header wiring in
  // App.jsx). The nav below is the one piece of admin chrome that stays on
  // screen across every admin route, so it's the one place that can
  // actually intercept "leaving" -- a route that isn't ArticleEditor never
  // reports a nonzero count, so this is a no-op everywhere else.
  const [unsavedCount, setUnsavedCount] = useState(0)
  // A deferred navigation, shown as an in-page confirmation instead of a
  // browser confirm() (consistent with ConfirmDelete.jsx): null when no nav
  // is pending, otherwise the function that performs it once confirmed.
  const [pendingNav, setPendingNav] = useState(null)

  const guard = (perform) => (e) => {
    if (unsavedCount > 0) {
      e.preventDefault()
      setPendingNav(() => perform)
    }
  }

  if (loading) return null
  if (!user) return <Login onLogin={login} />

  return (
    <div className="admin">
      <nav className="admin-nav">
        {/*
          Task 25, client feedback item 5 (replacing the earlier text "Voir
          le site" link, item 4): the artist's own PG mark, top-left, linking
          out to the live public site. It's a link with no other text, so
          its accessible name comes entirely from the image's alt.
          Task 27, client feedback item 7: same-tab now, not a new tab --
          this reverses the earlier new-tab instruction; the editor
          preview's own "Voir la page publique" link (ArticleEditor.jsx)
          stays a new tab, since that one is a genuine aside while editing.
          Task 28: a real <a href> to a different origin's-worth of app
          state (leaving the SPA entirely), so the guard below performs it
          via a real navigation (window.location), not `navigate()`.
        */}
        <a
          className="admin-nav-mark"
          href="/"
          onClick={guard(() => { window.location.href = '/' })}
        >
          <img src="/pg-mark.png" alt="Philippe Gronon" />
        </a>
        {/* Task 27, client feedback item 3: Articles, Pages, Images.
            Task 28: each guarded the same way -- see `guard` above. When
            there are no unsaved changes, `guard` never calls preventDefault
            and the <Link>'s own default navigation just happens; when there
            are, it's prevented and the same target is re-triggered via
            navigate() only once "Quitter" confirms leaving. */}
        <Link to="/admin" onClick={guard(() => navigate('/admin'))}>Articles</Link>
        <Link to="/admin/pages" onClick={guard(() => navigate('/admin/pages'))}>Pages</Link>
        <Link to="/admin/media" onClick={guard(() => navigate('/admin/media'))}>Images</Link>
        <button
          type="button"
          onClick={() => { if (unsavedCount > 0) setPendingNav(() => logout); else logout() }}
        >
          Déconnexion
        </button>
        {/*
          Task 28, client feedback: block leaving the editor with unsaved
          changes -- covers every one of the controls above (the only ones
          that can navigate away from a mounted editor route while staying
          in the admin chrome). Does NOT cover: the browser's own
          back/forward buttons (this app uses <BrowserRouter>, not a data
          router, so React Router's useBlocker isn't available, and
          popstate isn't reliably interceptable without one -- see the task
          report), or ConfirmDelete's own delete flow (deleting the article
          makes any unsaved field edits moot, so it intentionally skips
          this). Closing the tab, reloading, or typing a new URL are
          covered separately, by ArticleEditor's own beforeunload listener.
        */}
        {pendingNav && (
          <span className="unsaved-nav-confirm" role="group" aria-label="Modifications non enregistrées">
            <span className="unsaved-nav-confirm-prompt">Modifications non enregistrées. Quitter quand même ?</span>
            <button
              type="button"
              className="button-danger"
              onClick={() => { const perform = pendingNav; setPendingNav(null); perform() }}
            >
              Quitter
            </button>
            <button type="button" className="admin-row-button" onClick={() => setPendingNav(null)}>
              Annuler
            </button>
          </span>
        )}
      </nav>
      {/*
        Relative route paths: <Admin/> is only ever mounted nested inside a
        matched <Route path="/admin/*"> (see App.jsx's layout-route setup),
        so route context here has parentPathnameBase "/admin" and these
        resolve against it, the same way the rest of the app's routes do.
        That also means Task 21's admin pages get real route context for
        free: a relative <Link> written inside any of them resolves
        correctly, rather than needing to be hand-written absolute.
      */}
      {/*
        `.admin-content` is what gets `flex: 1` below (client feedback item
        3): `.admin` is a flex column of exactly `.admin-nav` (flex: 0 0
        auto) and this, so nav + content together are exactly one viewport
        tall, instead of `.admin`'s own min-height: 100dvh stacking on top
        of the nav's own height and overflowing by that amount.
      */}
      <div className="admin-content">
        <SessionExpiredProvider value={clearSession}>
          <Routes>
            <Route index element={<ArticleList />} />
            <Route path="articles/new" element={<ArticleEditor onUnsavedCountChange={setUnsavedCount} />} />
            <Route path="articles/:id" element={<ArticleEditor onUnsavedCountChange={setUnsavedCount} />} />
            <Route path="media" element={<MediaLibrary />} />
            <Route path="pages" element={<PagesIndex />} />
            <Route path="pages/:key" element={<PageEditor />} />
            <Route path="*" element={<AdminNotFound />} />
          </Routes>
        </SessionExpiredProvider>
      </div>
    </div>
  )
}
