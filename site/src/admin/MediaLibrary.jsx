import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, apiUpload } from '@/api.js'
import { useDebouncedValue } from '@/lib/useDebouncedValue.js'
import { assessImage, formatBytes, formatDimensions, isOrphan, QUALITY } from './imageQuality.js'
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
  const [replacing, setReplacing] = useState({})
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState('all')

  // The whole library is already in memory (GET /admin/images returns every
  // image), so this filters locally and the debounce is not about sparing the
  // server -- it is about not rebuilding a list of several hundred thumbnails
  // between one keystroke and the next.
  const settledQuery = useDebouncedValue(query, 200)

  // Assessed once per image rather than inside the filter and again inside
  // the render: five hundred images, and the answer does not change between
  // the two.
  const assessed = useMemo(() => {
    const rows = images.map((image) => ({ image, orphan: isOrphan(image), ...assessImage(image) }))
    // Orphans first, and the rest in the order the API sent (newest upload
    // first). An image used nowhere is the one thing here that needs a
    // decision -- keep it, place it, or delete it -- and burying it among
    // five hundred that are all fine is how a library accumulates the ones
    // nobody meant to keep. A stable sort leaves both groups internally
    // untouched.
    return [...rows].sort((a, b) => Number(b.orphan) - Number(a.orphan))
  }, [images])

  const visibleImages = useMemo(() => {
    const needle = normalize(settledQuery).trim()
    return assessed.filter((entry) => {
      if (quality === 'orphan' && !entry.orphan) return false
      if (quality !== 'all' && quality !== 'orphan' && entry.quality !== quality) return false
      if (!needle) return true
      return normalize(searchableText(entry.image)).includes(needle)
    })
  }, [assessed, settledQuery, quality])

  const counts = useMemo(
    () => ({
      low: assessed.filter((e) => e.quality === QUALITY.LOW).length,
      oversized: assessed.filter((e) => e.quality === QUALITY.OVERSIZED).length,
      orphan: assessed.filter((e) => e.orphan).length,
    }),
    [assessed]
  )

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

  // Replaces the file behind an image while keeping the document, so every
  // article and gallery already pointing at it follows without being touched.
  // Uploading a better scan as a NEW image would mean hunting down each
  // reference by hand, and some photographs are used in three places.
  const replace = async (image, file) => {
    if (!file) return
    setRowErrors((prev) => ({ ...prev, [image._id]: '' }))
    setReplacing((prev) => ({ ...prev, [image._id]: true }))
    try {
      const updated = await apiUpload(`/admin/images/${image._id}/replace`, file)
      setImages((prev) => prev.map((img) => (img._id === image._id ? updated : img)))
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else if (err?.status === 409) {
        setRowErrors((prev) => ({ ...prev, [image._id]: 'Ce fichier est déjà dans la médiathèque sous une autre image.' }))
      } else {
        setRowErrors((prev) => ({ ...prev, [image._id]: "Impossible de remplacer cette image." }))
      }
    } finally {
      setReplacing((prev) => ({ ...prev, [image._id]: false }))
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
          {/*
            The counts live in the option labels, so the artist can see
            whether a filter is worth applying before applying it -- "0 image"
            after switching is a worse way to learn there is nothing wrong
            than never being tempted to switch.
          */}
          <label htmlFor="quality" className="sr-only">Filtrer par définition</label>
          <select id="quality" value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="all">Toutes les définitions</option>
            <option value={QUALITY.LOW}>Définition insuffisante ({counts.low})</option>
            <option value={QUALITY.OVERSIZED}>Surdimensionnées ({counts.oversized})</option>
            <option value="orphan">Utilisées nulle part ({counts.orphan})</option>
          </select>
          <p className="media-library-count" aria-live="polite">
            {/* French pluralises from two, so zero and one both take the singular. */}
            {settledQuery.trim() || quality !== 'all'
              ? `${visibleImages.length} image${visibleImages.length > 1 ? 's' : ''} sur ${images.length}`
              : `${images.length} image${images.length > 1 ? 's' : ''}`}
          </p>
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <ul className="media-library-grid">
          {visibleImages.map(({ image, quality: imageQuality, needed, orphan }) => (
            <li key={image._id} className={`media-library-item${orphan ? ' is-orphan' : ''}`}>
              {thumbSrc(image) && <img src={thumbSrc(image)} alt={image.alt?.fr || ''} />}
              {/*
                The original's dimensions and weight -- what the variants are
                cut from, and what actually sits on disk. A warning is
                attached only when there is something to say, and it names the
                number the image is measured against: "il en faudrait 2400 px"
                is actionable where a bare "trop petite" is not.
              */}
              <p className="media-library-meta">
                <span>{formatDimensions(image)}</span>
                <span>{formatBytes(image.variants?.original?.bytes ?? image.bytes)}</span>
                {orphan && (
                  <span className="media-library-flag is-orphan">utilisée nulle part</span>
                )}
                {imageQuality === QUALITY.LOW && (
                  <span className="media-library-flag is-low">il en faudrait {needed} px sur le grand côté</span>
                )}
                {imageQuality === QUALITY.OVERSIZED && (
                  <span className="media-library-flag is-oversized">bien au-delà des {needed} px affichables</span>
                )}
              </p>
              <LocalizedInput label="Texte alternatif" lang={lang} value={image.alt} onChange={(alt) => setAlt(image._id, alt)} />
              <div className="media-library-actions">
                <button type="button" className="button-primary" onClick={() => saveAlt(image)}>Enregistrer</button>
                {/*
                  A label wrapping a file input, not a button: there is no way
                  to open a file picker from script without one, and styling
                  the label is how it comes to look like the control beside it.
                */}
                <label className={`button-quiet${replacing[image._id] ? ' is-busy' : ''}`}>
                  {replacing[image._id] ? 'Envoi…' : 'Remplacer'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/tiff"
                    disabled={Boolean(replacing[image._id])}
                    onChange={(e) => { replace(image, e.target.files?.[0]); e.target.value = '' }}
                  />
                </label>
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

        {(settledQuery.trim() || quality !== 'all') && !visibleImages.length && (
          <p className="media-library-empty">Aucune image ne correspond à cette recherche.</p>
        )}
      </div>
    </div>
  )
}
