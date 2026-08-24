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
 * huge vertical gaps the client saw). `subtitle`/`yearLabel` are not
 * populated for this category today, but are still rendered if a future
 * edit ever adds one.
 *
 * Task 37, part A1: `<h1>` used to be suppressed for exhibitions, back when
 * each one's own `title` was just its bare year (repeating it next to the
 * timeline's own aria-current year would have been a duplicate label). The
 * split (task 33) promoted each exhibition's own name into `title`, but the
 * migration also left a text block carrying that same name in the body
 * (migrate/extract.js's splitExhibitionYear), which is what actually showed
 * on the page -- so the suppression papered over a real bug rather than
 * serving its original purpose. That leftover block is now removed at
 * extraction time (removeExhibitionTitleDuplicateBlocks), so every category,
 * exhibitions included, renders its own `title` here, in the header, like
 * every other.
 *
 * Extracted out of ArticleDetail so the exhibitions section (task 28, part
 * 3) can render the exact same header+body for the /expositions index's
 * "most recent year" content as an individual exhibition's own page does --
 * the two can never drift apart.
 */
export function ArticleBody({ article }) {
  const isExhibition = article.category === 'exhibitions'
  const { text, media, twoColumn } = splitArticleLayout(article.blocks)

  // Client feedback: the year reads as part of the title rather than as its
  // own line -- "Couvertures | 2025-2026". That is the same `title | year`
  // form ArticleCard.jsx already uses for the works index, and the form the
  // original site uses for its own work headings (there the whole string is
  // a single heading element too, not a title with a separate date beside
  // it). Joined into the heading text rather than kept as a separately
  // styled element so the two halves cannot drift apart in type or wrap
  // onto their own lines. Either half may be absent: an article with only a
  // year still gets a heading, and one with only a title gets no separator.
  const heading = [article.title, article.yearLabel].filter(Boolean).join(' | ')

  const hasHeader = Boolean(heading || article.subtitle)
  const header = hasHeader && (
    <header className="article-header">
      {heading && <h1>{heading}</h1>}
      {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
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
