import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { resolve, resolveBlock } from './resolveBlocks.js'

// `cover` is populated (an object with `variants`) right after a load, but
// can be a bare id string in between saves (or simply unset on a brand-new
// article) -- see the round-trip fix in ArticleEditor.jsx. Degrade to no
// image rather than throwing on `cover.variants` in either case.
function coverSrc(cover) {
  const medium = cover && typeof cover === 'object' ? cover.variants?.medium : null
  return medium?.path ? `/media/${medium.path}` : null
}

/**
 * Renders the draft article the way the public site would, for the editor's
 * live preview (task 25, section 1). Reuses BlockRenderer rather than a
 * second renderer, so the preview can't drift from the real thing and
 * inherits its security rule for free: only `text` blocks go through
 * dangerouslySetInnerHTML, `heading` and `specs` stay plain text. That is
 * never bypassed here.
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
  const cover = coverSrc(article.cover)

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
