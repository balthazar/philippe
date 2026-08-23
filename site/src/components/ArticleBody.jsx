import { BlockRenderer } from './BlockRenderer.jsx'
import { splitArticleLayout } from '@/lib/articleLayout.js'

/**
 * One article's header (title, subtitle, year) and body content.
 *
 * Task 26, part B2: two columns on desktop for a clean text-then-media
 * article (the works shape) -- text left, gallery right, tops aligned --
 * one column everywhere else. splitArticleLayout (site/src/lib/
 * articleLayout.js) decides which shape a given article has.
 *
 * Task 28: the header now lives INSIDE the grid (`.article-layout`) rather
 * than above it, as the first row of the text column, so its top edge lands
 * on the same grid line as the gallery's top edge -- see the
 * grid-template-areas rule in base.css. On mobile the same areas stack as
 * header, then gallery, then prose (not simply the desktop columns
 * collapsing in source order).
 *
 * Extracted out of ArticleDetail so the exhibitions section (task 28, part
 * 3) can render the exact same header+body for the /expositions index's
 * "most recent year" content as an individual exhibition's own page does --
 * the two can never drift apart.
 */
export function ArticleBody({ article }) {
  const { text, media, twoColumn } = splitArticleLayout(article.blocks)

  const header = (
    <header className="article-header">
      <h1>{article.title}</h1>
      {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
      {article.yearLabel && <p className="article-year">{article.yearLabel}</p>}
    </header>
  )

  if (!twoColumn) {
    return (
      <>
        {header}
        <BlockRenderer blocks={article.blocks} />
      </>
    )
  }

  return (
    <div className="article-layout">
      {header}
      <div className="article-text-col"><BlockRenderer blocks={text} /></div>
      <div className="article-media-col"><BlockRenderer blocks={media} /></div>
    </div>
  )
}
