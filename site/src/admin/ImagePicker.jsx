import { useEffect, useState } from 'react'
import { apiGet, apiUpload } from '@/api.js'
import { useSessionExpired } from './session.js'
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from './icons.jsx'

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
 * `renderBelow(image, index)` is the same idea for content under the tile
 * rather than in its control row -- the image's own legend, today.
 *
 * Grid mode is also reorderable, by drag or by the two arrow buttons on each
 * tile. Until it was, the only way to place a photograph was to have added it
 * in the right order in the first place: a photograph added later could only
 * ever land at the end. That is not a cosmetic limit -- a gallery's order is
 * what pairs each photograph with its entry in the article's own list of
 * legends, so an image stuck at the end is an image wearing the wrong
 * caption. (It happened: the Yves Tanguy verso n°27, added years after the
 * rest of the series, sat at the end of the Versos gallery.)
 *
 * Reordering is safe for those legends, incidentally: a legend lives on the
 * image itself (its `alt`), not on the position, so moving a tile carries its
 * caption with it.
 */
export function ImagePicker({ value, onChange, multiple = false, gridStyle = false, renderExtra, renderBelow }) {
  const onSessionExpired = useSessionExpired()
  const [images, setImages] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  // Grid-mode reorder state. Same shape and the same splice-out/splice-in
  // algorithm as BlockEditor's own block reordering, so the two behave
  // identically: dragging downward lands the tile after the hovered one,
  // dragging upward lands it before.
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const selected = multiple ? value || [] : value ? [value] : []
  const selectedIds = new Set(selected.filter(Boolean).map((img) => img._id))

  const reorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null) return
    const next = [...selected]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onChange(next)
  }

  // The keyboard-reachable half of the same operation. Native HTML
  // drag-and-drop has no keyboard path at all, so without these the order of
  // a gallery would be unreachable to anyone not using a mouse -- the same
  // reason BlockEditor keeps its up/down buttons beside its drag handle.
  const nudge = (index, delta) => reorder(index, index + delta)

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
          {selected.map((image, index) => {
            const showIndicator = dragIndex !== null && dragOverIndex === index && dragIndex !== index
            const indicatorSide = showIndicator ? (dragIndex < index ? 'after' : 'before') : null
            // The whole tile is draggable, unlike a block, which has a
            // separate handle -- a handle would only be a smaller target.
            // That used to rest on a tile holding no text field; it now
            // holds the legend input, so onDragStart below refuses to start
            // a drag that began inside it. Without that, selecting text in
            // the legend drags the tile instead.
            return (
            <li
              key={image._id}
              className={[
                'gallery-editor-tile',
                dragIndex === index ? 'is-dragging' : '',
                indicatorSide ? `drop-indicator-${indicatorSide}` : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={(e) => {
                if (e.target.closest?.('.gallery-editor-tile-legend')) { e.preventDefault(); return }
                setDragIndex(index)
              }}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index) }}
              onDrop={(e) => {
                e.preventDefault()
                reorder(dragIndex, index)
                setDragIndex(null)
                setDragOverIndex(null)
              }}
            >
              {thumbSrc(image) && <img src={thumbSrc(image)} alt={image.alt?.fr || ''} />}
              {/*
                The position, shown on the tile. A gallery's order is what
                pairs each photograph with its entry in the article's list of
                legends, so "which number is this one" is the question being
                answered while reordering, and counting tiles across a grid of
                sixty is not a reasonable way to answer it.
              */}
              <span className="gallery-editor-tile-position" aria-hidden="true">{index + 1}</span>
              <div className="gallery-editor-tile-controls">
                {/*
                  Named by POSITION, not by the image's alt text: an alt is
                  optional and, until the legends were stamped, was empty on
                  every image in the archive, which made every move button on
                  the page carry the identical accessible name. The position
                  is unique by construction, and it is also what the tile's
                  own badge shows, so the spoken name and the visible one are
                  the same thing.
                */}
                <button
                  type="button"
                  aria-label={`Déplacer l’image ${index + 1} vers la gauche`}
                  title="Déplacer vers la gauche"
                  disabled={index === 0}
                  onClick={() => nudge(index, -1)}
                >
                  <ArrowUpIcon style={{ transform: 'rotate(-90deg)' }} />
                </button>
                <button
                  type="button"
                  aria-label={`Déplacer l’image ${index + 1} vers la droite`}
                  title="Déplacer vers la droite"
                  disabled={index === selected.length - 1}
                  onClick={() => nudge(index, 1)}
                >
                  <ArrowDownIcon style={{ transform: 'rotate(-90deg)' }} />
                </button>
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
              {renderBelow?.(image, index)}
            </li>
            )
          })}
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
