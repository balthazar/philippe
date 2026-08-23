import { LocalizedInput } from './LocalizedInput.jsx'
import { RichText } from './RichText.jsx'
import { ImagePicker } from './ImagePicker.jsx'

const EMPTY = {
  text: { type: 'text', value: { fr: '', en: '' } },
  heading: { type: 'heading', value: { fr: '', en: '' }, level: 2 },
  image: { type: 'image', image: null, caption: { fr: '', en: '' }, size: 'wide' },
  gallery: { type: 'gallery', columns: 3, items: [] },
  specs: { type: 'specs', items: [] },
}

const LABELS = { text: 'Texte', heading: 'Titre', image: 'Image', gallery: 'Galerie', specs: 'Caractéristiques' }

// Heading text and specs terms/values are NEVER rich text (controller
// correction 3): unlike `text` blocks, they are not sanitized server-side.
// They're safe today only because every render path treats them as plain
// text and never passes them through dangerouslySetInnerHTML. Wiring a
// LocalizedInput here rather than RichText is deliberate, not an oversight.

export function BlockEditor({ blocks = [], lang, onChange }) {
  const replace = (i, block) => onChange(blocks.map((b, j) => (j === i ? block : b)))
  const move = (i, delta) => {
    const next = [...blocks]
    const [item] = next.splice(i, 1)
    next.splice(i + delta, 0, item)
    onChange(next)
  }

  return (
    <div className="block-editor">
      {blocks.map((block, i) => (
        <fieldset key={i} data-testid="block" className="block-editor-block">
          <legend>{LABELS[block.type] || block.type}</legend>

          {block.type === 'text' && (
            <RichText
              value={block.value[lang] || ''}
              onChange={(html) => replace(i, { ...block, value: { ...block.value, [lang]: html } })}
            />
          )}

          {block.type === 'heading' && (
            <>
              <LocalizedInput label="Titre" lang={lang} value={block.value} onChange={(value) => replace(i, { ...block, value })} />
              <label htmlFor={`level-${i}`}>Niveau</label>
              <select
                id={`level-${i}`}
                value={block.level || 2}
                onChange={(e) => replace(i, { ...block, level: Number(e.target.value) })}
              >
                <option value={2}>Titre 2</option>
                <option value={3}>Titre 3</option>
              </select>
            </>
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
            <>
              <ImagePicker
                multiple
                value={block.items.map((it) => it.image)}
                onChange={(images) =>
                  replace(i, {
                    ...block,
                    // Preserve each existing item's caption/span when the
                    // selection changes; only brand-new images get a fresh
                    // default entry.
                    items: images.map((image) => {
                      const existing = block.items.find((it) => it.image?._id === image?._id)
                      return existing || { image, caption: { fr: '', en: '' }, span: 1 }
                    }),
                  })
                }
              />
              <div className="gallery-columns">
                <label htmlFor={`columns-${i}`}>Colonnes</label>
                <select
                  id={`columns-${i}`}
                  value={block.columns || 3}
                  onChange={(e) => replace(i, { ...block, columns: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <ul className="gallery-spans">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <label htmlFor={`span-${i}-${j}`}>Largeur</label>
                    <select
                      id={`span-${i}-${j}`}
                      // Clamped to the block's own column count: never offer,
                      // or silently keep, a span wider than the gallery
                      // itself. Lowering `columns` after a wide span was set
                      // must not be able to produce a broken grid (task
                      // brief, gallery sizing rules).
                      value={Math.min(item.span || 1, block.columns || 3)}
                      onChange={(e) => replace(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, span: Number(e.target.value) } : it)) })}
                    >
                      {Array.from({ length: block.columns || 3 }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>{n === 1 ? '1 colonne' : `${n} colonnes`}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </>
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

          <div className="block-actions">
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>Monter</button>
            <button type="button" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>Descendre</button>
            <button type="button" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Supprimer</button>
          </div>
        </fieldset>
      ))}

      <label htmlFor="add-block">Ajouter un bloc</label>
      <select id="add-block" value="" onChange={(e) => e.target.value && onChange([...blocks, structuredClone(EMPTY[e.target.value])])}>
        <option value="">…</option>
        {Object.keys(EMPTY).map((type) => (
          <option key={type} value={type}>{LABELS[type]}</option>
        ))}
      </select>
    </div>
  )
}
