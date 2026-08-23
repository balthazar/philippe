import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiSend } from '@/api.js'

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
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiGet('/admin/articles').then((data) => {
      if (cancelled) return
      setArticles(data.items || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const togglePublish = useCallback(async (article) => {
    const status = article.status === 'published' ? 'draft' : 'published'
    const updated = await apiSend('PATCH', `/admin/articles/${article._id}`, { status })
    setArticles((prev) => prev.map((a) => (a._id === article._id ? { ...a, status: updated.status } : a)))
  }, [])

  const reorderCategory = useCallback(async (category, targetId) => {
    if (!dragId || dragId === targetId) return
    setArticles((prev) => {
      const categoryItems = prev.filter((a) => a.category === category)
      const rest = prev.filter((a) => a.category !== category)
      const fromIndex = categoryItems.findIndex((a) => a._id === dragId)
      const toIndex = categoryItems.findIndex((a) => a._id === targetId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const reordered = categoryItems.slice()
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      apiSend('POST', '/admin/articles/reorder', { ids: reordered.map((a) => a._id) }).catch(() => {})
      // Splice the reordered category back in at its original position among
      // the other categories, so the on-screen grouping order doesn't jump.
      const next = prev.map((a) => a)
      let cursor = 0
      return next.map((a) => {
        if (a.category !== category) return a
        return reordered[cursor++]
      })
    })
  }, [dragId])

  if (loading) return null

  const groups = groupByCategory(articles)

  return (
    <div className="admin-article-list">
      <div className="admin-toolbar">
        <h1>Articles</h1>
        <Link to="/admin/articles/new" className="button">Nouvel article</Link>
      </div>

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
                  setDragId(null)
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
