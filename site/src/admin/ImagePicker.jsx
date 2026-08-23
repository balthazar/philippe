import { useEffect, useState } from 'react'
import { apiGet, apiUpload } from '@/api.js'
import { useSessionExpired } from './session.js'

const thumbSrc = (image) => (image?.variants?.thumb?.path ? `/media/${image.variants.thumb.path}` : '')

/**
 * Single mode: value is one image object (or null) and onChange receives one
 * image object (or null). Multiple mode (`multiple`): value is an array of
 * image objects and onChange receives an array, in the order chosen -- used
 * by the gallery block, which needs to preserve that order and each item's
 * own span (BlockEditor does the merge against the previous items list).
 */
export function ImagePicker({ value, onChange, multiple = false }) {
  const onSessionExpired = useSessionExpired()
  const [images, setImages] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const selected = multiple ? value || [] : value ? [value] : []
  const selectedIds = new Set(selected.filter(Boolean).map((img) => img._id))

  useEffect(() => {
    if (!open) return
    let cancelled = false
    apiGet('/admin/images')
      .then((data) => { if (!cancelled) setImages(data.items || []) })
      .catch((err) => {
        if (cancelled) return
        if (err?.status === 401) onSessionExpired()
        else setError('Impossible de charger les images.')
      })
    return () => { cancelled = true }
  }, [open, onSessionExpired])

  const toggle = (image) => {
    if (!multiple) {
      onChange(selectedIds.has(image._id) ? null : image)
      if (!selectedIds.has(image._id)) setOpen(false)
      return
    }
    onChange(
      selectedIds.has(image._id)
        ? selected.filter((img) => img._id !== image._id)
        : [...selected, image]
    )
  }

  const upload = async (file) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const image = await apiUpload('/admin/images', file)
      setImages((prev) => [image, ...prev])
      if (multiple) onChange([...selected, image])
      else { onChange(image); setOpen(false) }
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible d'envoyer cette image.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="image-picker">
      <div className="image-picker-selection">
        {selected.map((image) => (
          <figure key={image._id} className="image-picker-thumb">
            {thumbSrc(image) && <img src={thumbSrc(image)} alt={image.alt?.fr || ''} />}
            <button type="button" onClick={() => toggle(image)} aria-label={`Retirer ${image.alt?.fr || 'cette image'}`}>
              Retirer
            </button>
          </figure>
        ))}
        {selected.length === 0 && <p className="image-picker-empty">Aucune image sélectionnée</p>}
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)}>
        {open ? 'Fermer la médiathèque' : 'Choisir une image'}
      </button>

      {open && (
        <div className="image-picker-library">
          {error && <p role="alert" className="admin-error">{error}</p>}
          <label className="image-picker-upload">
            Envoyer une image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/tiff"
              disabled={uploading}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          <ul className="image-picker-grid">
            {images.map((image) => (
              <li key={image._id}>
                <button
                  type="button"
                  className={selectedIds.has(image._id) ? 'selected' : ''}
                  onClick={() => toggle(image)}
                >
                  {thumbSrc(image) && <img src={thumbSrc(image)} alt={image.alt?.fr || ''} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
