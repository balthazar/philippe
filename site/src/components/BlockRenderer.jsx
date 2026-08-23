import { useState } from 'react'
import { Lightbox } from './Lightbox.jsx'

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
            // Server-sanitized on write, so this is safe to inject.
            return <div key={i} className="block-text" dangerouslySetInnerHTML={{ __html: block.value }} />
          case 'heading': {
            const Tag = block.level === 3 ? 'h3' : 'h2'
            return <Tag key={i} className="block-heading">{block.value}</Tag>
          }
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
            // out here, before both the grid AND the lightbox's own image
            // list, so a hidden image can never become reachable by
            // arrowing through the visible ones either.
            const items = (block.items || []).filter((item) => !item.hidden)
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
