import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { apiGet, apiSend } from '@/api.js'
import { useSessionExpired } from './session.js'
import { LocalizedInput } from './LocalizedInput.jsx'
import { BlockEditor } from './BlockEditor.jsx'
import { ImagePicker } from './ImagePicker.jsx'

// Matches api/src/lib/constants.js CATEGORIES; duplicated rather than
// imported for the same reason ArticleList.jsx duplicates it: the admin is a
// separate bundle from the API and this is a small, stable, display-only list.
const CATEGORY_LABELS = {
  works: 'Œuvres',
  exhibitions: 'Expositions',
  editions: 'Éditions',
  'public-orders': 'Commandes publiques',
}

const EMPTY_ARTICLE = {
  title: { fr: '', en: '' },
  yearLabel: { fr: '', en: '' },
  slug: { fr: '', en: '' },
  category: 'works',
  yearStart: '',
  yearEnd: '',
  cover: null,
  blocks: [],
  status: 'draft',
}

export function ArticleEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const onSessionExpired = useSessionExpired()

  const [article, setArticle] = useState(EMPTY_ARTICLE)
  const [lang, setLang] = useState('fr')
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    apiGet(`/admin/articles/${id}`)
      .then((data) => { if (!cancelled) { setArticle(data); setLoading(false) } })
      .catch((err) => {
        if (cancelled) return
        setLoading(false)
        if (err?.status === 401) onSessionExpired()
        else setError("Impossible de charger cet article.")
      })
    return () => { cancelled = true }
  }, [id, onSessionExpired])

  const update = (patch) => {
    setArticle((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      ...article,
      cover: article.cover?._id || null,
      yearStart: article.yearStart === '' ? undefined : Number(article.yearStart),
      yearEnd: article.yearEnd === '' ? undefined : Number(article.yearEnd),
      blocks: article.blocks.map((block) => ({
        ...block,
        image: block.image?._id || block.image || undefined,
        items: block.items?.map((item) => ({ ...item, image: item.image?._id || item.image || undefined })),
      })),
    }
    try {
      if (id) {
        const updated = await apiSend('PATCH', `/admin/articles/${id}`, payload)
        setArticle(updated)
      } else {
        const created = await apiSend('POST', '/admin/articles', payload)
        // Swap to the edit route for the article that now exists, so a
        // second save PATCHes it instead of creating a duplicate.
        navigate(`/admin/articles/${created._id}`, { replace: true })
        setArticle(created)
      }
      setSaved(true)
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible d'enregistrer cet article.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <form className="admin-editor" onSubmit={save}>
      <div className="admin-toolbar">
        <h1>{id ? article.title?.fr || 'Article' : 'Nouvel article'}</h1>
        <Link to="/admin">Retour aux articles</Link>
      </div>

      <div className="lang-toggle" role="group" aria-label="Langue du contenu">
        <button type="button" className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>Français</button>
        <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
      </div>

      {error && <p role="alert" className="admin-error">{error}</p>}

      <LocalizedInput label="Titre" lang={lang} value={article.title} onChange={(title) => update({ title })} />
      <LocalizedInput label="Année affichée" lang={lang} value={article.yearLabel} onChange={(yearLabel) => update({ yearLabel })} />
      <LocalizedInput label="Slug" lang={lang} value={article.slug} onChange={(slug) => update({ slug })} />

      <label htmlFor="category">Catégorie</label>
      <select id="category" value={article.category} onChange={(e) => update({ category: e.target.value })}>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <div className="year-sort-fields">
        <label htmlFor="yearStart">Année de début (tri)</label>
        <input
          id="yearStart"
          type="number"
          value={article.yearStart}
          onChange={(e) => update({ yearStart: e.target.value })}
        />
        <label htmlFor="yearEnd">Année de fin (tri)</label>
        <input
          id="yearEnd"
          type="number"
          value={article.yearEnd}
          onChange={(e) => update({ yearEnd: e.target.value })}
        />
      </div>

      <fieldset>
        <legend>Image de couverture</legend>
        <ImagePicker value={article.cover} onChange={(cover) => update({ cover })} />
      </fieldset>

      <fieldset>
        <legend>Contenu</legend>
        <BlockEditor blocks={article.blocks} lang={lang} onChange={(blocks) => update({ blocks })} />
      </fieldset>

      <div className="admin-editor-actions">
        <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        {saved && <span className="save-confirmation">Enregistré</span>}
      </div>
    </form>
  )
}
