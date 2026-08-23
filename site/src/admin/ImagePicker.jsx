import { useEffect, useState } from 'react'
import { apiGet, apiUpload } from '@/api.js'
import { useSessionExpired } from './session.js'
import { PlusIcon, TrashIcon } from './icons.jsx'

const thumbSrc = (image) => (image?.variants?.thumb?.path ? `/media/${image.variants.thumb.path}` : '')

/**
 * Single mode: value is one image object (or null) and onChange receives one
 * image object (or null). Multiple mode (`multiple`): value is an array of
 * image objects and onChange receives an array, in the order chosen -- used
 * by the gallery block, which needs to preserve that order and each item's
 * own span (BlockEditor does the merge against the previous items list).
 *
 * `gridStyle` (task 27, client feedback item 5): multiple mode only. Renders
 * the selection as a grid of tiles ending in an empty "+" tile that opens
 * the library, instead of the plain thumbnail-plus-"Retirer" row and its
 * separate "Choisir une image" button -- the gallery block's own editor.
 * `renderExtra(image, index)`, also grid-only, lets the caller (BlockEditor)
 * inject gallery-specific controls (Cover/Hidden/Width) into each tile,
 * since this component only ever knows about images, never those concepts.
 */
export function ImagePicker({ value, onChange, multiple = false, gridStyle = false, renderExtra }) {
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

  const library = open && (
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
  )

  if (multiple && gridStyle) {
    return (
      <div className="image-picker image-picker-grid-style">
        <ul className="gallery-editor-grid">
          {selected.map((image, index) => (
            <li key={image._id} className="gallery-editor-tile">
              {thumbSrc(image) && <img src={thumbSrc(image)} alt={image.alt?.fr || ''} />}
              <div className="gallery-editor-tile-controls">
                {renderExtra?.(image, index)}
                <button
                  type="button"
                  className="icon-button-danger"
                  aria-label={`Retirer ${image.alt?.fr || 'cette image'}`}
                  title={`Retirer ${image.alt?.fr || 'cette image'}`}
                  onClick={() => toggle(image)}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
          <li className="gallery-editor-tile gallery-editor-add">
            <button
              type="button"
              aria-label={open ? 'Fermer la médiathèque' : 'Ajouter une image'}
              title={open ? 'Fermer la médiathèque' : 'Ajouter une image'}
              onClick={() => setOpen((v) => !v)}
            >
              <PlusIcon />
            </button>
          </li>
        </ul>
        {library}
      </div>
    )
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

      {library}
    </div>
  )
}
