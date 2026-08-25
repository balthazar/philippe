import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, apiUpload } from '@/api.js'
import { useDebouncedValue } from '@/lib/useDebouncedValue.js'
import { useSessionExpired } from './session.js'
import { LocalizedInput } from './LocalizedInput.jsx'
import { ConfirmDelete } from './ConfirmDelete.jsx'

const thumbSrc = (image) => (image?.variants?.thumb?.path ? `/media/${image.variants.thumb.path}` : '')

/**
 * Accent- and case-insensitive, so "developpement" finds "Cuvette de
 * développement" and "ecritoire" finds "Écritoire". Nearly every legend in
 * this archive carries an accent, and a search that made the artist reproduce
 * them exactly would be a search he stops using.
 */
const normalize = (text) =>
  String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Both languages at once: he should not have to know which one holds the word he remembers. */
const searchableText = (image) => `${image?.alt?.fr || ''} ${image?.alt?.en || ''}`

export function MediaLibrary() {
  const onSessionExpired = useSessionExpired()
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [lang, setLang] = useState('fr')
  const [rowErrors, setRowErrors] = useState({})
  const [query, setQuery] = useState('')

  // The whole library is already in memory (GET /admin/images returns every
  // image), so this filters locally and the debounce is not about sparing the
  // server -- it is about not rebuilding a list of several hundred thumbnails
  // between one keystroke and the next.
  const settledQuery = useDebouncedValue(query, 200)
  const visibleImages = useMemo(() => {
    const needle = normalize(settledQuery).trim()
    if (!needle) return images
    return images.filter((image) => normalize(searchableText(image)).includes(needle))
  }, [images, settledQuery])

  useEffect(() => {
    let cancelled = false
    apiGet('/admin/images')
      .then((data) => { if (!cancelled) { setImages(data.items || []); setLoading(false) } })
      .catch((err) => {
        if (cancelled) return
        setLoading(false)
        if (err?.status === 401) onSessionExpired()
        else setError('Impossible de charger la médiathèque.')
      })
    return () => { cancelled = true }
  }, [onSessionExpired])

  const upload = async (file) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const image = await apiUpload('/admin/images', file)
      setImages((prev) => [image, ...prev])
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible d'envoyer cette image.")
    } finally {
      setUploading(false)
    }
  }

  const setAlt = (id, alt) => {
    setImages((prev) => prev.map((img) => (img._id === id ? { ...img, alt } : img)))
  }

  const saveAlt = async (image) => {
    setRowErrors((prev) => ({ ...prev, [image._id]: '' }))
    try {
      const updated = await apiSend('PATCH', `/admin/images/${image._id}`, { alt: image.alt })
      setImages((prev) => prev.map((img) => (img._id === image._id ? updated : img)))
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setRowErrors((prev) => ({ ...prev, [image._id]: "Impossible d'enregistrer la légende." }))
    }
  }

  const remove = async (image) => {
    setRowErrors((prev) => ({ ...prev, [image._id]: '' }))
    try {
      await apiSend('DELETE', `/admin/images/${image._id}`)
      setImages((prev) => prev.filter((img) => img._id !== image._id))
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else if (err?.status === 409) {
        setRowErrors((prev) => ({ ...prev, [image._id]: 'Cette image est utilisée dans un article ou une page et ne peut pas être supprimée.' }))
      } else {
        setRowErrors((prev) => ({ ...prev, [image._id]: 'Impossible de supprimer cette image.' }))
      }
    }
  }

  if (loading) return null

  return (
    // Task 27, client feedback item 3: same page container as Articles and
    // Pages now (.admin-editor-layout, the outer row; .admin-index-content,
    // the zero-padding inner column that owns this content's own edge).
    <div className="admin-editor-layout">
      <div className="admin-index-content admin-media-library">
        <div className="admin-toolbar">
          <h1>Images</h1>
          <label className="button image-picker-upload">
            {uploading ? 'Envoi…' : 'Envoyer une image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/tiff"
              disabled={uploading}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="lang-toggle" role="group" aria-label="Langue des légendes">
          <button type="button" className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>Français</button>
          <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
        </div>

        <div className="media-library-search">
          <input
            type="search"
            value={query}
            placeholder="Rechercher dans les textes alternatifs"
            aria-label="Rechercher dans les textes alternatifs"
            onChange={(e) => setQuery(e.target.value)}
          />
          {/*
            The count is the only feedback that a search with no matches
            worked rather than broke -- an empty grid on its own reads as a
            page that failed to load. aria-live so it is announced when it
            changes, rather than only being found by someone who goes looking.
          */}
          <p className="media-library-count" aria-live="polite">
            {/* French pluralises from two, so zero and one both take the singular. */}
            {settledQuery.trim()
              ? `${visibleImages.length} image${visibleImages.length > 1 ? 's' : ''} sur ${images.length}`
              : `${images.length} image${images.length > 1 ? 's' : ''}`}
          </p>
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <ul className="media-library-grid">
          {visibleImages.map((image) => (
            <li key={image._id} className="media-library-item">
              {thumbSrc(image) && <img src={thumbSrc(image)} alt={image.alt?.fr || ''} />}
              <LocalizedInput label="Texte alternatif" lang={lang} value={image.alt} onChange={(alt) => setAlt(image._id, alt)} />
              <div className="media-library-actions">
                <button type="button" onClick={() => saveAlt(image)}>Enregistrer</button>
                {/*
                  In-page confirmation, not window.confirm() (task 25, client
                  feedback item 3): one unconfirmed click here used to also
                  destroy the archival original under _originals/, alongside
                  every derived variant.
                */}
                <ConfirmDelete label={image.alt?.fr || image.filename} onConfirm={() => remove(image)} />
              </div>
              {rowErrors[image._id] && <p role="alert" className="admin-error">{rowErrors[image._id]}</p>}
            </li>
          ))}
        </ul>

        {settledQuery.trim() && !visibleImages.length && (
          <p className="media-library-empty">Aucune image ne correspond à cette recherche.</p>
        )}
      </div>
    </div>
  )
}
