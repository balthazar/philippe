import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet, apiSend } from '@/api.js'
import { useSessionExpired } from './session.js'
import { LocalizedInput } from './LocalizedInput.jsx'
import { BlockEditor } from './BlockEditor.jsx'
import { PagePreview } from './PagePreview.jsx'

// Matches api/src/lib/constants.js PAGE_KEYS. Exported so PagesIndex.jsx
// (task 25, section 6) can list all eight without duplicating this table.
export const PAGE_LABELS = {
  home: 'Accueil',
  works: 'Œuvres (intro)',
  exhibitions: 'Expositions (intro)',
  biography: 'Biographie',
  contact: 'Contact',
  bibliography: 'Bibliographie',
  links: 'Liens',
  legal: 'Mentions légales',
}

const EMPTY_PAGE = { title: { fr: '', en: '' }, blocks: [] }

export function PageEditor() {
  const { key } = useParams()
  const onSessionExpired = useSessionExpired()

  const [page, setPage] = useState(EMPTY_PAGE)
  const [lang, setLang] = useState('fr')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet(`/admin/pages/${key}`)
      .then((data) => {
        if (cancelled) return
        setPage({ title: data.title || { fr: '', en: '' }, blocks: data.blocks || [] })
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoading(false)
        if (err?.status === 401) onSessionExpired()
        else setError('Impossible de charger cette page.')
      })
    return () => { cancelled = true }
  }, [key, onSessionExpired])

  const update = (patch) => {
    setPage((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      ...page,
      blocks: page.blocks.map((block) => ({
        ...block,
        image: block.image?._id || block.image || undefined,
        items: block.items?.map((item) => ({ ...item, image: item.image?._id || item.image || undefined })),
      })),
    }
    try {
      const updated = await apiSend('PATCH', `/admin/pages/${key}`, payload)
      setPage({ title: updated.title || { fr: '', en: '' }, blocks: updated.blocks || [] })
      setSaved(true)
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible d'enregistrer cette page.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    // Same container ArticleEditor uses. Client feedback, round 2:
    // .admin-preview-layout, not .admin-editor-layout -- the preview
    // column sits flush against the page's right edge now, unlike the
    // centred, width-capped container the "index" screens still use.
    <div className="admin-preview-layout">
      <form className="admin-editor" onSubmit={save}>
        <div className="admin-toolbar">
          <h1>{PAGE_LABELS[key] || key}</h1>
          {/*
            Task 27, D5: dropped, same reasoning as the article back-links
            removed earlier -- the nav (Pages, above) already covers it.
          */}
        </div>

        <div className="lang-toggle" role="group" aria-label="Langue du contenu">
          <button type="button" className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>Français</button>
          <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <LocalizedInput label="Titre" lang={lang} value={page.title} onChange={(title) => update({ title })} />

        <fieldset>
          <legend>Contenu</legend>
          <BlockEditor blocks={page.blocks} lang={lang} onChange={(blocks) => update({ blocks })} />
        </fieldset>

        <div className="admin-editor-actions">
          <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          {saved && <span className="save-confirmation">Enregistré</span>}
        </div>
      </form>

      {/* Task 27, Part C1: pages had no live preview at all. */}
      <aside className="admin-preview-pane" aria-label="Aperçu">
        <div className="admin-preview-header">
          <h2>Aperçu</h2>
        </div>
        <div className="admin-preview-scroll">
          <PagePreview page={page} lang={lang} />
        </div>
      </aside>
    </div>
  )
}
