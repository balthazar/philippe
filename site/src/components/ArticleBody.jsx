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
 * Task 29, parts 1 and 2: an exhibition article is a different shape
 * entirely -- a repeating series of entries (heading, optional credit,
 * gallery), not one article with a prose column -- so it never takes the
 * works two-column path, no matter how a single entry's own blocks happen
 * to partition (a plain heading-then-gallery entry, 10 of the 25 years,
 * partitions exactly as cleanly as a real works article and would otherwise
 * be split, stretching a one-line text column beside a tall gallery -- the
 * huge vertical gaps the client saw). Its own year is also dropped from the
 * header: the exhibitions timeline beside it already marks that year
 * current (aria-current), so repeating it as an h1 would be a duplicate
 * label, not new information. `subtitle`/`yearLabel` are not populated for
 * this category today, but are still rendered if a future edit ever adds
 * one -- only the year title itself is exhibitions-specific chrome.
 *
 * Extracted out of ArticleDetail so the exhibitions section (task 28, part
 * 3) can render the exact same header+body for the /expositions index's
 * "most recent year" content as an individual exhibition's own page does --
 * the two can never drift apart.
 */
export function ArticleBody({ article }) {
  const isExhibition = article.category === 'exhibitions'
  const { text, media, twoColumn } = splitArticleLayout(article.blocks)

  const hasHeader = !isExhibition || article.subtitle || article.yearLabel
  const header = hasHeader && (
    <header className="article-header">
      {!isExhibition && <h1>{article.title}</h1>}
      {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
      {article.yearLabel && <p className="article-year">{article.yearLabel}</p>}
    </header>
  )

  if (isExhibition || !twoColumn) {
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
