import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiSend } from '@/api.js'
import { routeFor } from '@/routes.js'
import { useSessionExpired } from './session.js'
import { LocalizedInput } from './LocalizedInput.jsx'
import { BlockEditor } from './BlockEditor.jsx'
import { ArticlePreview } from './ArticlePreview.jsx'
import { ExternalLinkIcon } from './icons.jsx'
import { ConfirmDelete } from './ConfirmDelete.jsx'

const STATUS_LABELS = { draft: 'Brouillon', published: 'Publié' }

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
  subtitle: { fr: '', en: '' },
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
  const [statusBusy, setStatusBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

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
      // article.cover is populated (an object) right after a GET, but PATCH
      // used to return it as a bare id -- see the api-side populate fix in
      // admin.js. `?._id || article.cover` keeps this correct either way,
      // matching the fallback the line below already uses for block images.
      cover: article.cover?._id || article.cover || null,
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

  // Task 25, client feedback item 3: the artist looked for publish/unpublish
  // in the editor and only found it in the article list. Immediate PATCH
  // (like the list's own toggle), separate from the full-form "Enregistrer"
  // flow, so flipping status never bundles in unrelated unsaved edits and
  // never silently requires remembering to also click Save.
  const togglePublish = async () => {
    setError('')
    setStatusBusy(true)
    const status = article.status === 'published' ? 'draft' : 'published'
    try {
      const updated = await apiSend('PATCH', `/admin/articles/${id}`, { status })
      setArticle((prev) => ({ ...prev, status: updated.status }))
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible de changer le statut de cet article.")
    } finally {
      setStatusBusy(false)
    }
  }

  // DELETE existed on the API (api/src/routes/admin.js) with nothing in the
  // UI calling it. ConfirmDelete gates this behind an in-page confirmation
  // naming the article, never a browser confirm().
  const deleteArticle = async () => {
    setError('')
    setDeleteBusy(true)
    try {
      await apiSend('DELETE', `/admin/articles/${id}`)
      navigate('/admin')
    } catch (err) {
      setDeleteBusy(false)
      if (err?.status === 401) onSessionExpired()
      else setError('Impossible de supprimer cet article.')
    }
  }

  if (loading) return null

  // Task 27, Part A: every article lives at the root now (/:slug), the same
  // for every category, so routeFor's first argument is moot here -- it
  // only ever selects a section's own segment, and that never happens once
  // a slug is given.
  const slug = article.slug?.[lang] || article.slug?.fr || ''
  // A draft, or an article with no slug yet, has no public page: GET
  // /articles/:slug only ever resolves a published article, so a link built
  // for either case would 404.
  const canLinkLive = article.status === 'published' && Boolean(slug)
  const liveUrl = canLinkLive ? routeFor('article', lang, slug) : null
  const noLiveLinkReason = !slug
    ? "Cet article n'a pas encore de slug : pas de page publique."
    : "Cet article est un brouillon : pas encore de page publique."

  return (
    // Client feedback, round 2: the preview column sits flush against the
    // page's right edge now (.admin-preview-layout), unlike the centred,
    // width-capped .admin-editor-layout the "index" screens (Articles,
    // Pages, Images) still use.
    <div className="admin-preview-layout">
      <form className="admin-editor" onSubmit={save}>
        {/*
          Client feedback: the title shown here was redundant with the
          Titre input (left) and the preview's own <h1> (right), so it's
          gone -- the freed line now carries the FR/EN toggle beside the
          publish control, the two controls that act on the whole article
          rather than one field of it.
        */}
        <div className="admin-toolbar">
          <div className="lang-toggle" role="group" aria-label="Langue du contenu">
            <button type="button" className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>Français</button>
            <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
          </div>
          {/*
            Task 25, client feedback item 3: publish/unpublish only lived
            in the article list; the artist looked for it here too. Only
            shown for an already-saved article -- there's nothing to PATCH
            a status onto until the first save creates it.
          */}
          {id && (
            <span className="admin-status-control">
              <span className={`status-badge status-${article.status}`}>{STATUS_LABELS[article.status] || article.status}</span>
              <button type="button" onClick={togglePublish} disabled={statusBusy}>
                {article.status === 'published' ? 'Dépublier' : 'Publier'}
              </button>
            </span>
          )}
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <LocalizedInput label="Titre" lang={lang} value={article.title} onChange={(title) => update({ title })} />
        {/*
          Task 27, Part B1: the migration added `subtitle` and it renders on
          the public page, but the editor never got an input for it. Plain
          text (LocalizedInput), never rich text: not sanitized
          server-side, same rule as Titre and Slug. Placed beside them, per
          the brief.
        */}
        <LocalizedInput label="Sous-titre" lang={lang} value={article.subtitle} onChange={(subtitle) => update({ subtitle })} />
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

        {/*
          Task 27, Part B3: the gallery (inside Contenu) is the substance of
          a work, so it sits directly after "Année de début (tri)" rather
          than further down the form. The separate cover picker is gone: a
          post-migration archive check (37 of 63 articles had a cover not
          among their gallery images, one had no gallery at all) showed the
          picker couldn't safely be dropped without it -- the client's
          answer was two per-item gallery toggles ("Cover", "Hidden from
          grid") instead, and a migration that folded every such cover into
          its own gallery as a hidden item first. Both toggles are wired via
          onSetCover/coverId below.
        */}
        <fieldset>
          <legend>Contenu</legend>
          <BlockEditor
            blocks={article.blocks}
            lang={lang}
            onChange={(blocks) => update({ blocks })}
            onSetCover={(cover) => update({ cover })}
            coverId={article.cover?._id || article.cover || null}
          />
        </fieldset>

        <div className="admin-editor-actions">
          <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          {saved && <span className="save-confirmation">Enregistré</span>}
          {id && (
            <span className="admin-editor-delete">
              <ConfirmDelete label={article.title?.fr || 'cet article'} onConfirm={deleteArticle} busy={deleteBusy} />
            </span>
          )}
        </div>
      </form>

      <aside className="admin-preview-pane" aria-label="Aperçu">
        <div className="admin-preview-header">
          <h2>Aperçu</h2>
          {canLinkLive ? (
            <a className="admin-preview-live-link" href={liveUrl} target="_blank" rel="noopener">
              <ExternalLinkIcon />
              Voir la page publique
            </a>
          ) : (
            <span className="admin-preview-live-link is-disabled" title={noLiveLinkReason}>
              <ExternalLinkIcon />
              {noLiveLinkReason}
            </span>
          )}
        </div>
        <div className="admin-preview-scroll">
          <ArticlePreview article={article} lang={lang} />
        </div>
      </aside>
    </div>
  )
}
