import { Routes, Route, Link } from 'react-router-dom'
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
      <Link to="/admin">Retour aux articles</Link>
    </div>
  )
}

export default function Admin() {
  const { user, loading, login, logout, clearSession } = useAuth()
  if (loading) return null
  if (!user) return <Login onLogin={login} />

  return (
    <div className="admin">
      <nav className="admin-nav">
        {/*
          Task 25, client feedback item 5 (replacing the earlier text "Voir
          le site" link, item 4): the artist's own PG mark, top-left, linking
          out to the live public site in a new tab. It's a link with no other
          text, so its accessible name comes entirely from the image's alt.
        */}
        <a className="admin-nav-mark" href="/" target="_blank" rel="noopener">
          <img src="/pg-mark.png" alt="Philippe Gronon" />
        </a>
        <Link to="/admin">Articles</Link>
        <Link to="/admin/media">Images</Link>
        <Link to="/admin/pages">Pages</Link>
        <button type="button" onClick={logout}>Déconnexion</button>
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
            <Route path="articles/new" element={<ArticleEditor />} />
            <Route path="articles/:id" element={<ArticleEditor />} />
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
