import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { resolve, resolveBlock, buildImageIndex } from './resolveBlocks.js'

/**
 * Task 27, Part C1: PageEditor had no live preview at all (ArticleEditor's
 * ArticlePreview already had one). Reuses BlockRenderer exactly as
 * ArticlePreview does -- never a second renderer -- through the same
 * resolveBlock() mapper the two share (resolveBlocks.js). A page has no
 * cover or yearLabel (those are article-only fields), so this is a smaller
 * sibling of ArticlePreview rather than that component reused directly.
 *
 * Task 32, item 5: `buildImageIndex` reads `article?.cover` too, but a page
 * has none -- passing `page` here simply means that lookup finds nothing,
 * which is correct, not a special case this component needs to know about.
 */
export function PagePreview({ page, lang }) {
  const title = resolve(page.title, lang)
  const imageIndex = buildImageIndex(page)
  const blocks = (page.blocks || []).map((block) => resolveBlock(block, lang, imageIndex))

  return (
    <div className="article-preview">
      <header className="article-header">
        <h1>{title || 'Sans titre'}</h1>
      </header>
      <BlockRenderer blocks={blocks} />
    </div>
  )
}
