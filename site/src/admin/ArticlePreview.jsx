import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { resolve, resolveBlock } from './resolveBlocks.js'

// Task 30 bug report: `cover` is populated (an object with `variants`)
// right after a load, but can legitimately be a bare id string in between
// saves -- right after the gallery star toggle sets a new cover (pre-save),
// or right after a save whose response wasn't populated (see the api-side
// fix in admin.js's POST handler). Falling straight back to "no cover" for
// a bare id is the WRONG fallback: it is indistinguishable from the article
// genuinely having none, so a display-shape problem reads to the artist as
// data loss. Since the cover migration, every cover is one of the article's
// own gallery images, so a bare id is resolved locally against the blocks
// already in the editor first; only a cover that is truly absent (or an id
// this article's own blocks don't recognize at all) falls back to the
// placeholder.
function findImageById(blocks, id) {
  for (const block of blocks || []) {
    if (block.type === 'image' && block.image && typeof block.image === 'object' && block.image._id === id) {
      return block.image
    }
    if (block.type === 'gallery') {
      for (const item of block.items || []) {
        if (item.image && typeof item.image === 'object' && item.image._id === id) return item.image
      }
    }
  }
  return null
}

function coverSrc(cover, blocks) {
  const image = cover && typeof cover === 'string' ? findImageById(blocks, cover) : cover
  const medium = image && typeof image === 'object' ? image.variants?.medium : null
  return medium?.path ? `/media/${medium.path}` : null
}

/**
 * Renders the draft article the way the public site would, for the editor's
 * live preview (task 25, section 1). Reuses BlockRenderer rather than a
 * second renderer, so the preview can't drift from the real thing and
 * inherits its security rule for free: only `text` blocks go through
 * dangerouslySetInnerHTML, `specs` (and, since Task 30 part 5 retired the
 * separate `heading` block type, any <h2>/<h3> a heading now produces
 * inside a `text` block's own sanitized HTML) never bypass that. That rule
 * is never bypassed here.
 *
 * Caveat, stated rather than engineered around: this shows `text` blocks
 * *before* the server's sanitizer runs (sanitizing happens on save), so in
 * principle it could render markup the server would later strip. In
 * practice RichText's schema already disables every extension that could
 * produce non-whitelisted markup (see RichText.jsx), so what's typed here
 * and what survives on the server always agree.
 */
export function ArticlePreview({ article, lang }) {
  const title = resolve(article.title, lang)
  // Task 27, Part B2: rendered directly under the title, before anything
  // else -- the same position ArticleDetail.jsx (the public page) uses.
  const subtitle = resolve(article.subtitle, lang)
  const yearLabel = resolve(article.yearLabel, lang)
  const blocks = (article.blocks || []).map((block) => resolveBlock(block, lang))
  const cover = coverSrc(article.cover, article.blocks)

  return (
    <div className="article-preview">
      {cover ? (
        <img className="article-preview-cover" src={cover} alt="" />
      ) : (
        <div className="article-preview-cover article-preview-cover-empty">Pas d'image de couverture</div>
      )}
      <header className="article-header">
        <h1>{title || 'Sans titre'}</h1>
        {subtitle && <p className="article-subtitle">{subtitle}</p>}
        {yearLabel && <p className="article-year">{yearLabel}</p>}
      </header>
      <BlockRenderer blocks={blocks} />
    </div>
  )
}
