import { Routes, Route, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { Login } from './Login.jsx'
import { ArticleList } from './ArticleList.jsx'
import { ArticleEditor } from './ArticleEditor.jsx'
import { MediaLibrary } from './MediaLibrary.jsx'
import { PageEditor } from './PageEditor.jsx'
import './admin.css'

export default function Admin() {
  const { user, loading, login, logout } = useAuth()
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
        Absolute paths, not relative/index: Admin is rendered directly (not
        nested inside a matched <Route path="/admin/*">, see App.jsx), so
        there is no ancestor route stripping an "/admin" prefix from the
        location before these are matched. Login.test.jsx renders <Admin/>
        standalone at "/admin" and relies on that.
      */}
      <Routes>
        <Route path="/admin" element={<ArticleList />} />
        <Route path="/admin/articles/new" element={<ArticleEditor />} />
        <Route path="/admin/articles/:id" element={<ArticleEditor />} />
        <Route path="/admin/media" element={<MediaLibrary />} />
        <Route path="/admin/pages/:key" element={<PageEditor />} />
      </Routes>
    </div>
  )
}
