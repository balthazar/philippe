import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { resolve, resolveBlock, buildImageIndex, resolveImage } from './resolveBlocks.js'

// Task 30 bug report, extended by task 32 item 5: `cover` (and, as of this
// task, `block.image`/`item.image` too) is populated (an object with
// `variants`) right after a load, but can legitimately be a bare id string
// in between saves -- right after the gallery star toggle sets a new cover
// (pre-save), or right after a save whose response wasn't populated.
// Falling straight back to "no image" for a bare id is the WRONG fallback:
// it is indistinguishable from the field genuinely having none, so a
// display-shape problem reads to the artist as data loss. `resolveImage`
// (resolveBlocks.js) is the single place that answers "object or id, and if
// id, which object" now, used here for the cover exactly the same way
// resolveBlock uses it for every block's own image fields below -- there
// used to be two different answers to this question (this file's own
// `findImageById`, cover-only, and resolveBlock not answering it for blocks
// at all); now there is one.
function coverSrc(cover, imageIndex) {
  const image = resolveImage(cover, imageIndex)
  const medium = image?.variants?.medium
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
  const imageIndex = buildImageIndex(article)
  const blocks = (article.blocks || []).map((block) => resolveBlock(block, lang, imageIndex))
  const cover = coverSrc(article.cover, imageIndex)

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
