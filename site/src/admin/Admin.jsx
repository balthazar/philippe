import { Routes, Route, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { Login } from './Login.jsx'
import { ArticleList } from './ArticleList.jsx'
import { ArticleEditor } from './ArticleEditor.jsx'
import { MediaLibrary } from './MediaLibrary.jsx'
import { PageEditor } from './PageEditor.jsx'
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
        <Link to="/admin">Articles</Link>
        <Link to="/admin/media">Images</Link>
        <Link to="/admin/pages/biography">Pages</Link>
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
      <SessionExpiredProvider value={clearSession}>
        <Routes>
          <Route index element={<ArticleList />} />
          <Route path="articles/new" element={<ArticleEditor />} />
          <Route path="articles/:id" element={<ArticleEditor />} />
          <Route path="media" element={<MediaLibrary />} />
          <Route path="pages/:key" element={<PageEditor />} />
          <Route path="*" element={<AdminNotFound />} />
        </Routes>
      </SessionExpiredProvider>
    </div>
  )
}
