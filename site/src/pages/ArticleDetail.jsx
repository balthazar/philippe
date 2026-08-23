import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { routeFor } from '@/routes.js'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { splitArticleLayout } from '@/lib/articleLayout.js'
import { usePageTitle } from '@/lib/usePageTitle.js'
import { articlePageTitle } from '@/lib/pageTitle.js'

/**
 * The public API always resolves `slug` to the requested language and never
 * exposes the counterpart (locked in Task 9: "every response is
 * language-resolved, plain strings, not {fr, en}"). But GET /articles/:slug
 * matches on slug.fr OR slug.en regardless of the `lang` query param, so
 * re-fetching the same slug with `lang=otherLang` returns the very same
 * article, this time resolved into the other language, including its slug
 * in that language. That's the only field this fetch is for: it drives the
 * header's language-toggle href, not this page's own content.
 *
 * Fix round 1 (Task 22): this goes through usePageData, keyed exactly as
 * prerender/index.js's preloadFor() keys it (`translatedPath:<slug>:<lang>`),
 * so on a prerendered route the correct counterpart href is already in the
 * server-rendered HTML -- a crawler or a fast click never sees a stale
 * fallback link. src/main.jsx reads the same preload data back out of
 * window.__PRELOAD__ at hydration time, so the client's first render matches
 * the server's; without that, this would be a genuine hydration mismatch (an
 * href that differs from what the server sent), not just a stale link.
 *
 * Task 27, Part A: articles live at the root now (works and exhibitions
 * share one flat slug namespace), so the cache keys below are keyed on the
 * slug alone -- already globally unique -- rather than a `routeKey` prop
 * this component no longer needs (a route-provided section no longer means
 * anything to `routeFor` once a slug is given).
 */
export function ArticleDetail({ onTranslatedPath }) {
  const { slug } = useParams()
  const { lang, otherLang, href } = useLang()
  const { data: article, error } = usePageData(`article:${slug}:${lang}`, () =>
    apiGet(`/articles/${slug}`, { lang })
  )

  const { data: translatedPath } = usePageData(`translatedPath:${slug}:${lang}`, () =>
    apiGet(`/articles/${slug}`, { lang: otherLang }).then((data) => routeFor('article', otherLang, data.slug))
  )

  // Coordinator feedback (task 27): the prerender already gets this right
  // in the raw HTML; this is what keeps it right after hydration and on
  // every later client-side navigation between articles, using the exact
  // same formatter prerender/index.js's headFor() does.
  usePageTitle(article && articlePageTitle(article.title, article.yearLabel))

  useEffect(() => {
    onTranslatedPath?.(translatedPath ?? null)
    return () => onTranslatedPath?.(null)
  }, [translatedPath, onTranslatedPath])

  // `article` is checked before `error` as belt and braces. usePageData now
  // resets both synchronously on a key change, so a stale error from a
  // previous slug can no longer survive into a new one; this ordering simply
  // costs nothing and keeps the success path the one that wins.
  if (!article) {
    if (error?.status === 404) {
      return (
        <Container as="main" className="page-main">
          <p>{lang === 'fr' ? 'Page introuvable.' : 'Page not found.'}</p>
        </Container>
      )
    }
    // Task 26, correction to B4: reserve the page's minimum height while
    // loading instead of rendering nothing, so the footer never rides up.
    return <Container as="main" className="page-main" aria-busy="true" />
  }

  // Task 26, part B2: text left, gallery right on desktop, stacked as
  // title, subtitle, then gallery on mobile. Only a clean text-then-media
  // article (the works shape) splits into two columns; see
  // articleLayout.js for why an interleaved one (a handful of
  // multi-exhibition-per-year pages) falls back to a single column.
  const { text, media, twoColumn } = splitArticleLayout(article.blocks)

  return (
    <Container as="main" className="page-main">
      <article>
        <header className="article-header">
          <h1>{article.title}</h1>
          {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
          {article.yearLabel && <p className="article-year">{article.yearLabel}</p>}
        </header>

        {twoColumn ? (
          <div className="article-layout">
            <div className="article-text-col"><BlockRenderer blocks={text} /></div>
            <div className="article-media-col"><BlockRenderer blocks={media} /></div>
          </div>
        ) : (
          <BlockRenderer blocks={article.blocks} />
        )}

        <nav className="article-pager" aria-label={lang === 'fr' ? 'Navigation entre œuvres' : 'Article navigation'}>
          {article.prev && (
            <Link to={href('article', article.prev.slug)} rel="prev">
              {lang === 'fr' ? 'Précédent' : 'Previous'}
            </Link>
          )}
          {article.next && (
            <Link to={href('article', article.next.slug)} rel="next">
              {lang === 'fr' ? 'Suivant' : 'Next'}
            </Link>
          )}
        </nav>
      </article>
    </Container>
  )
}
