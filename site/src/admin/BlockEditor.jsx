import { useState } from 'react'
import { LocalizedInput } from './LocalizedInput.jsx'
import { RichText } from './RichText.jsx'
import { ImagePicker } from './ImagePicker.jsx'
import { ArrowUpIcon, ArrowDownIcon, TrashIcon, StarIcon, EyeIcon, WidthIcon } from './icons.jsx'

// Task 30, part 5: `heading` is retired as an insertable block type. A
// heading is now authored inside a `text` block via RichText's own "Titre"
// toolbar button (an <h2>/<h3>, sanitized server-side same as the rest of
// that block's HTML) -- there is no separate heading block to insert any
// more.
const EMPTY = {
  text: { type: 'text', value: { fr: '', en: '' } },
  image: { type: 'image', image: null, caption: { fr: '', en: '' }, size: 'wide' },
  gallery: { type: 'gallery', columns: 3, items: [] },
  specs: { type: 'specs', items: [] },
}

const LABELS = { text: 'Texte', image: 'Image', gallery: 'Galerie', specs: 'Caractéristiques' }

// Specs terms/values are NEVER rich text (controller correction 3): unlike
// `text` blocks, they are not sanitized server-side. They're safe today only
// because every render path treats them as plain text and never passes them
// through dangerouslySetInnerHTML. Wiring a LocalizedInput here rather than
// RichText is deliberate, not an oversight.

// Client feedback (task 27), replacing the original plan of keeping a
// separate cover picker: `onSetCover`/`coverId` are only ever passed from
// ArticleEditor (pages have no `cover` field at all), so the gallery block's
// per-item "Cover"/"Hidden from grid" toggles below only render there.
export function BlockEditor({ blocks = [], lang, onChange, onSetCover, coverId }) {
  // Drag-reorder, in the block-header drag handle only (never the whole
  // fieldset): the block body can hold a RichText/TipTap field, and a
  // draggable block would swallow that field's own text-selection drag
  // gesture. Same reorder algorithm as ArticleList.jsx's reorderCategory
  // (task 25, section 6): splice the dragged item out, then splice it back
  // in at the drop target's original index. The up/down icon buttons stay
  // untouched alongside it -- drag is a shortcut, they're the keyboard-
  // reachable guarantee, since native HTML drag-and-drop has no keyboard path.
  const [dragIndex, setDragIndex] = useState(null)
  // Task 25, client feedback item 1: dragging gave no sign of where a block
  // would land. Tracks which block is currently hovered during a drag so a
  // drop-indicator line can render on the correct edge.
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const replace = (i, block) => onChange(blocks.map((b, j) => (j === i ? block : b)))
  const move = (i, delta) => {
    const next = [...blocks]
    const [item] = next.splice(i, 1)
    next.splice(i + delta, 0, item)
    onChange(next)
  }
  const insertAt = (index, type) => {
    const next = [...blocks]
    next.splice(index, 0, structuredClone(EMPTY[type]))
    onChange(next)
  }
  const reorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    const next = [...blocks]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onChange(next)
  }

  return (
    <div className="block-editor">
      {blocks.map((block, i) => {
        // Same splice-out/splice-in reorder algorithm as ArticleList.jsx's
        // reorderCategory: dragging downward lands the dragged block after
        // the hovered one, dragging upward lands it before -- the indicator
        // shows exactly that edge, so what the artist sees during the drag
        // matches what actually happens on drop.
        const showIndicator = dragIndex !== null && dragOverIndex === i && dragIndex !== i
        const indicatorSide = showIndicator ? (dragIndex < i ? 'after' : 'before') : null

        return (
        <div key={i} className="block-editor-item">
          <div className="block-insert-point">
            <label htmlFor={`insert-${i}`} className="sr-only">Insérer un bloc avant celui-ci</label>
            <select
              id={`insert-${i}`}
              className="block-insert-select"
              value=""
              onChange={(e) => e.target.value && insertAt(i, e.target.value)}
            >
              <option value="">+ Insérer un bloc</option>
              {Object.keys(EMPTY).map((type) => (
                <option key={type} value={type}>{LABELS[type]}</option>
              ))}
            </select>
          </div>

          <fieldset
            data-testid="block"
            className={[
              'block-editor-block',
              dragIndex === i ? 'is-dragging' : '',
              indicatorSide ? `drop-indicator-${indicatorSide}` : '',
            ].filter(Boolean).join(' ')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverIndex(i)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex !== null) reorder(dragIndex, i)
              setDragIndex(null)
              setDragOverIndex(null)
            }}
          >
            {/*
              Icons live inside the legend, on the same line as the type
              name, so the type is stated once (client correction, task 25
              item 1): a separate header row duplicated it above the
              legend's own caption.
            */}
            <legend className="block-editor-legend">
              <span
                className="block-drag-handle"
                aria-hidden="true"
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
              >
                ⠿
              </span>
              <span className="block-type-label">{LABELS[block.type] || block.type}</span>
              {/*
                Client feedback (task 27, item 5): the column-count field
                moves out of the block body and into the header, beside the
                move arrows -- gallery blocks only.
              */}
              {block.type === 'gallery' && (
                <span className="gallery-columns-control">
                  {/*
                    Task 30, part 4: the column count is meaningless in
                    slider mode (one image shown at a time), so it is hidden
                    rather than left as a control that does nothing.
                  */}
                  {block.mode !== 'slider' && (
                    <>
                      <label htmlFor={`columns-${i}`} className="sr-only">Colonnes</label>
                      <select
                        id={`columns-${i}`}
                        value={block.columns || 3}
                        onChange={(e) => replace(i, { ...block, columns: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>{n} col.</option>
                        ))}
                      </select>
                    </>
                  )}
                  <label htmlFor={`mode-${i}`} className="sr-only">Mode d'affichage</label>
                  <select
                    id={`mode-${i}`}
                    value={block.mode || 'grid'}
                    onChange={(e) => replace(i, { ...block, mode: e.target.value })}
                  >
                    <option value="grid">Grille</option>
                    <option value="slider">Diaporama</option>
                  </select>
                </span>
              )}
              <span className="block-editor-controls">
                <button
                  type="button"
                  aria-label="Monter le bloc"
                  title="Monter le bloc"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  aria-label="Descendre le bloc"
                  title="Descendre le bloc"
                  disabled={i === blocks.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  className="icon-button-danger"
                  aria-label="Supprimer le bloc"
                  title="Supprimer le bloc"
                  onClick={() => onChange(blocks.filter((_, j) => j !== i))}
                >
                  <TrashIcon />
                </button>
              </span>
            </legend>

            {/*
              Task 30, part 5: `heading` is retired as its own block type.
              A heading is now authored right here, inside a `text` block,
              via RichText's "Titre" toolbar button -- there is no separate
              heading block body any more.
            */}
            {block.type === 'text' && (
              <RichText
                value={block.value[lang] || ''}
                onChange={(html) => replace(i, { ...block, value: { ...block.value, [lang]: html } })}
              />
            )}

            {block.type === 'image' && (
              <>
                <ImagePicker value={block.image} onChange={(image) => replace(i, { ...block, image })} />
                <LocalizedInput label="Légende" lang={lang} value={block.caption} onChange={(caption) => replace(i, { ...block, caption })} />
                <label htmlFor={`size-${i}`}>Taille</label>
                <select id={`size-${i}`} value={block.size || 'wide'} onChange={(e) => replace(i, { ...block, size: e.target.value })}>
                  <option value="inset">Encart</option>
                  <option value="wide">Large</option>
                  <option value="full">Pleine largeur</option>
                </select>
              </>
            )}

            {block.type === 'gallery' && (
              // Client feedback (task 27, item 5): per-image controls are
              // icons now, consistent with the block header icons above --
              // Trash to remove, Star to set as cover, Eye to hide from the
              // public grid, and a Width icon that cycles the item's own
              // span. The grid's own trailing "+" tile (ImagePicker's
              // gridStyle) replaces the separate "Choisir une image"
              // button. Column count moved to the block header (above);
              // this body is the image grid alone now.
              <ImagePicker
                multiple
                gridStyle
                value={block.items.map((it) => it.image)}
                onChange={(images) =>
                  replace(i, {
                    ...block,
                    // Preserve each existing item's caption/span/hidden when
                    // the selection changes; only brand-new images get a
                    // fresh default entry.
                    items: images.map((image) => {
                      const existing = block.items.find((it) => it.image?._id === image?._id)
                      return existing || { image, caption: { fr: '', en: '' }, span: 1 }
                    }),
                  })
                }
                renderExtra={(image, j) => {
                  const item = block.items[j] || {}
                  const columns = block.columns || 3
                  // Clamped to the block's own column count: a span wider
                  // than the gallery itself must never be offered, or kept,
                  // after `columns` is lowered (task brief, gallery sizing
                  // rules) -- the cycle wraps within that same clamp.
                  const span = Math.min(item.span || 1, columns)
                  const isCover = Boolean(coverId) && image?._id === coverId
                  return (
                    <>
                      <button
                        type="button"
                        aria-label={`Largeur : ${span} colonne${span > 1 ? 's' : ''}`}
                        title={`Largeur : ${span} colonne${span > 1 ? 's' : ''}`}
                        onClick={() =>
                          replace(i, {
                            ...block,
                            items: block.items.map((it, k) => (k === j ? { ...it, span: (span % columns) + 1 } : it)),
                          })
                        }
                      >
                        <WidthIcon />
                      </button>
                      {/*
                        Client feedback (task 27): "Cover" acts on the WHOLE
                        article, not per gallery block -- there is only ever
                        one `article.cover`. `isCover` is derived from
                        coverId (the article's actual cover id), never local
                        state, so it stays correct even across more than one
                        gallery block. Only rendered when onSetCover is
                        passed (ArticleEditor) -- PageEditor's pages have no
                        `cover` field at all.
                      */}
                      {/*
                        Task 30, part 3: a real toggle now. Pressing the
                        star on the CURRENT cover clears `article.cover`
                        (onSetCover(null)) rather than being a dead end once
                        set. The label says what the press WILL do, not only
                        the current state -- "Couverture actuelle" described
                        state alone and gave no hint that pressing it did
                        anything, the same reason the Eye control below
                        already phrases its own label as an action.
                      */}
                      {onSetCover && (
                        <button
                          type="button"
                          className={isCover ? 'active' : ''}
                          aria-pressed={isCover}
                          aria-label={isCover ? 'Retirer la couverture' : 'Définir comme couverture'}
                          title={isCover ? 'Retirer la couverture' : 'Définir comme couverture'}
                          onClick={() => onSetCover(isCover ? null : image)}
                        >
                          <StarIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className={item.hidden ? 'active' : ''}
                        aria-pressed={Boolean(item.hidden)}
                        aria-label={item.hidden ? 'Afficher dans la grille' : 'Masquer de la grille'}
                        title={item.hidden ? 'Afficher dans la grille' : 'Masquer de la grille'}
                        onClick={() =>
                          replace(i, {
                            ...block,
                            items: block.items.map((it, k) => (k === j ? { ...it, hidden: !it.hidden } : it)),
                          })
                        }
                      >
                        <EyeIcon />
                      </button>
                    </>
                  )
                }}
              />
            )}

            {block.type === 'specs' && (
              <div className="specs-editor">
                {block.items.map((item, j) => (
                  <div key={j} className="specs-row">
                    <LocalizedInput label="Terme" lang={lang} value={item.term} onChange={(term) => replace(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, term } : it)) })} />
                    <LocalizedInput label="Valeur" lang={lang} value={item.value} onChange={(value) => replace(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, value } : it)) })} />
                    <button type="button" onClick={() => replace(i, { ...block, items: block.items.filter((_, k) => k !== j) })}>
                      Supprimer la ligne
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => replace(i, { ...block, items: [...block.items, { term: { fr: '', en: '' }, value: { fr: '', en: '' } }] })}>
                  Ajouter une ligne
                </button>
              </div>
            )}
          </fieldset>
        </div>
        )
      })}

      {/*
        Client feedback: this append control did nearly the same thing as
        the per-gap "Insérer un bloc" select above and looked nothing like
        it. Same markup, same classes, same "+ <label>" first option.
      */}
      <div className="block-insert-point">
        <label htmlFor="add-block" className="sr-only">Ajouter un bloc</label>
        <select
          id="add-block"
          className="block-insert-select"
          value=""
          onChange={(e) => e.target.value && onChange([...blocks, structuredClone(EMPTY[e.target.value])])}
        >
          <option value="">+ Ajouter un bloc</option>
          {Object.keys(EMPTY).map((type) => (
            <option key={type} value={type}>{LABELS[type]}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
