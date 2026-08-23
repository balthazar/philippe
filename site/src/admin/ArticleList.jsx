import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiSend } from '@/api.js'
import { useSessionExpired } from './session.js'

// Order categories are grouped and displayed in. Matches api/src/lib/constants.js
// CATEGORIES; duplicated here (rather than imported) because the admin is a
// separate bundle from the API and this is a small, stable, display-only list.
const CATEGORY_ORDER = ['works', 'exhibitions', 'editions', 'public-orders']
const CATEGORY_LABELS = {
  works: 'Œuvres',
  exhibitions: 'Expositions',
  editions: 'Éditions',
  'public-orders': 'Commandes publiques',
}

const STATUS_LABELS = { draft: 'Brouillon', published: 'Publié' }

function groupByCategory(items) {
  const groups = new Map()
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, [])
    groups.get(item.category).push(item)
  }
  const ordered = CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => [c, groups.get(c)])
  // Any category not in CATEGORY_ORDER (shouldn't happen, but don't drop data
  // silently if the API ever adds one) is appended at the end.
  for (const [category, list] of groups) {
    if (!CATEGORY_ORDER.includes(category)) ordered.push([category, list])
  }
  return ordered
}

export function ArticleList() {
  const onSessionExpired = useSessionExpired()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dragId, setDragId] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiGet('/admin/articles')
      .then((data) => {
        if (cancelled) return
        setArticles(data.items || [])
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        // loading must never be left true on a failed request: on a 401
        // (the 12-hour session cookie expired while this page was open)
        // fall back to the login form instead of hanging on a blank page;
        // anything else, show a visible message.
        setLoading(false)
        if (err?.status === 401) onSessionExpired()
        else setError('Impossible de charger les articles.')
      })
    return () => { cancelled = true }
  }, [onSessionExpired])

  const togglePublish = useCallback(async (article) => {
    const status = article.status === 'published' ? 'draft' : 'published'
    // Clear any banner from a previous failure first. Without this the alert
    // from one failed action stays on screen through every later success,
    // telling the artist something is broken long after it stopped being.
    setError('')
    try {
      const updated = await apiSend('PATCH', `/admin/articles/${article._id}`, { status })
      setArticles((prev) => prev.map((a) => (a._id === article._id ? { ...a, status: updated.status } : a)))
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError('Impossible de mettre à jour cet article.')
    }
  }, [onSessionExpired])

  const reorderCategory = useCallback(async (category, targetId) => {
    if (!dragId || dragId === targetId) return
    const dragged = dragId
    setDragId(null)

    // Computed from the current `articles` state directly (not via a
    // setArticles updater): the reorder POST below is a side effect, and a
    // setState updater function must stay pure (React can invoke it more
    // than once, e.g. under StrictMode, which would double-fire the POST).
    const categoryItems = articles.filter((a) => a.category === category)
    const fromIndex = categoryItems.findIndex((a) => a._id === dragged)
    const toIndex = categoryItems.findIndex((a) => a._id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const reorderedCategory = categoryItems.slice()
    const [moved] = reorderedCategory.splice(fromIndex, 1)
    reorderedCategory.splice(toIndex, 0, moved)

    setError('')
    const previous = articles
    let cursor = 0
    setArticles(previous.map((a) => (a.category === category ? reorderedCategory[cursor++] : a)))

    try {
      await apiSend('POST', '/admin/articles/reorder', { ids: reorderedCategory.map((a) => a._id) })
    } catch (err) {
      // The new order was already applied optimistically above: put it back
      // exactly as it was rather than leaving the screen silently out of
      // step with what the server actually has.
      setArticles(previous)
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible d'enregistrer le nouvel ordre.")
    }
  }, [dragId, articles, onSessionExpired])

  if (loading) return null

  const groups = groupByCategory(articles)

  return (
    <div className="admin-article-list">
      <div className="admin-toolbar">
        <h1>Articles</h1>
        <Link to="/admin/articles/new" className="button">Nouvel article</Link>
      </div>

      {error && <p role="alert" className="admin-error">{error}</p>}

      {groups.map(([category, items]) => (
        <section key={category} className="admin-article-group">
          <h2>{CATEGORY_LABELS[category] || category}</h2>
          <ul>
            {items.map((article) => (
              <li
                key={article._id}
                draggable
                onDragStart={() => setDragId(article._id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  reorderCategory(category, article._id)
                }}
                onDragEnd={() => setDragId(null)}
                className="admin-article-row"
              >
                <span className="drag-handle" aria-hidden="true">⠿</span>
                <Link to={`/admin/articles/${article._id}`}>{article.title?.fr}</Link>
                <span className={`status-badge status-${article.status}`}>
                  {STATUS_LABELS[article.status] || article.status}
                </span>
                <button type="button" onClick={() => togglePublish(article)}>
                  {article.status === 'published' ? 'Dépublier' : 'Publier'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
