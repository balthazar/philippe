import { useEffect, useState } from 'react'
import { apiGet, apiSend, apiUpload } from '@/api.js'
import { useSessionExpired } from './session.js'
import { LocalizedInput } from './LocalizedInput.jsx'
import { ConfirmDelete } from './ConfirmDelete.jsx'

const thumbSrc = (image) => (image?.variants?.thumb?.path ? `/media/${image.variants.thumb.path}` : '')

export function MediaLibrary() {
  const onSessionExpired = useSessionExpired()
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [lang, setLang] = useState('fr')
  const [rowErrors, setRowErrors] = useState({})

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

        {error && <p role="alert" className="admin-error">{error}</p>}

        <ul className="media-library-grid">
          {images.map((image) => (
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
      </div>
    </div>
  )
}
