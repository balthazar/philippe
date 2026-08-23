import { ArticleBody } from './ArticleBody.jsx'
import { ExhibitionsTimeline } from './ExhibitionsTimeline.jsx'

/**
 * Task 28, part 3: shared chrome for the exhibitions section. The year
 * timeline down the left is persistent, not a one-off index widget -- the
 * /expositions index (Exhibitions.jsx, showing the most recent year) and
 * every individual exhibition article page (ArticleDetail.jsx, showing its
 * own year) render this exact same structure, so the timeline can never
 * drift between the two.
 */
export function ExhibitionsChrome({ items, article }) {
  return (
    <article className="exhibitions-layout">
      <ExhibitionsTimeline items={items} currentSlug={article.slug} />
      <div className="exhibitions-content">
        <ArticleBody article={article} />
      </div>
    </article>
  )
}
