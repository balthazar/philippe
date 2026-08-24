import { useState } from 'react'
import { Lightbox } from './Lightbox.jsx'
import { GallerySlider } from './GallerySlider.jsx'
import { ReferenceGrid } from './ReferenceGrid.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

function Picture({ image, sizes = '100vw' }) {
  const medium = image?.variants?.medium
  const large = image?.variants?.large
  if (!medium) return null
  return (
    <img
      src={src(medium)}
      srcSet={[medium, large].filter(Boolean).map((v) => `${src(v)} ${v.width}w`).join(', ')}
      sizes={sizes}
      width={medium.width}
      height={medium.height}
      alt={image.alt || ''}
      loading="lazy"
    />
  )
}

export function BlockRenderer({ blocks = [] }) {
  const [lightbox, setLightbox] = useState(null)

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text':
            // Server-sanitized on write, so this is safe to inject. Task
            // 30, part 5: `heading` is retired as its own block type -- a
            // heading is now an <h2>/<h3> inside this same sanitized HTML
            // (styled via .block-text h2/h3 in base.css), which is a
            // genuine security improvement: heading values used to be the
            // one field stored unsanitized, safe only because every render
            // path treated them as plain text.
            return <div key={i} className="block-text" dangerouslySetInnerHTML={{ __html: block.value }} />
          case 'specs':
            return (
              <dl key={i} className="block-specs">
                {(block.items || []).map((item, j) => (
                  <div key={j}>
                    <dt>{item.term}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )
          // Task 39: bibliography entries and links, as a grid of cards.
          // Its own component -- an entry has three renderings depending on
          // which of its two optional fields are present, which is more
          // branching than belongs inline in this switch.
          case 'references':
            return <ReferenceGrid key={i} items={block.items} />
          case 'image':
            return (
              <figure key={i} className={`block-image size-${block.size || 'wide'}`}>
                <Picture image={block.image} />
                {block.caption && <figcaption>{block.caption}</figcaption>}
              </figure>
            )
          case 'gallery': {
            // Task 27, client feedback item 1: a gallery item can be
            // `hidden` -- kept in the data (so it can also serve as the
            // article's cover) without showing in the public grid. Filtered
            // out here, before both the grid/slider AND the lightbox's own
            // image list, so a hidden image can never become reachable by
            // arrowing through the visible ones either.
            const items = (block.items || []).filter((item) => !item.hidden)

            // Task 30, part 4: slider mode shows one image at a time via
            // GallerySlider, sharing its carousel/crossfade machinery with
            // the homepage Slideshow. Clicking the current slide opens the
            // very same Lightbox the grid uses, scoped to this block's own
            // (already hidden-filtered) item list, so arrowing through the
            // lightbox never reaches a hidden image there either.
            if (block.mode === 'slider') {
              return (
                <GallerySlider
                  key={i}
                  items={items}
                  onActivate={(j) => setLightbox({ images: items.map((it) => it.image), index: j })}
                />
              )
            }

            return (
              <ul key={i} className="block-gallery" style={{ '--columns': block.columns || 3 }}>
                {items.map((item, j) => (
                  // span is the per-image grid setting. Clamped to the block's
                  // column count so lowering `columns` later cannot break the grid.
                  <li key={j} style={{ gridColumn: `span ${Math.min(item.span || 1, block.columns || 3)}` }}>
                    <button
                      type="button"
                      aria-label={item.image?.alt || `Image ${j + 1}`}
                      onClick={() => setLightbox({ images: items.map((it) => it.image), index: j })}
                    >
                      <Picture image={item.image} sizes="33vw" />
                    </button>
                    {item.caption && <span className="caption">{item.caption}</span>}
                  </li>
                ))}
              </ul>
            )
          }
          default:
            return null // forward compatible: an unknown block never breaks a page
        }
      })}

      {lightbox && (
        <Lightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}
