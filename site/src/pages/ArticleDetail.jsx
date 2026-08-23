import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { routeFor } from '@/routes.js'
import { Container } from '@/components/Container.jsx'
import { ArticleBody } from '@/components/ArticleBody.jsx'
import { ExhibitionsChrome } from '@/components/ExhibitionsChrome.jsx'
import { sortExhibitionsByYear } from '@/lib/exhibitionsOrder.js'
import { usePageTitle } from '@/lib/usePageTitle.js'
import { articlePageTitle } from '@/lib/pageTitle.js'

/**
 * Task 28, part 3: the exhibitions timeline is persistent chrome for the
 * whole section, not just the /expositions index -- every exhibition
 * article page shows the same year list, with its own year marked current.
 * A separate component (rather than a conditional hook call inside
 * ArticleDetail itself) because the timeline's own fetch must only ever run
 * for an exhibition article: React's rules of hooks forbid calling a hook
 * conditionally in the component that owns it, but a child component that is
 * only ever mounted for exhibitions can call its own hooks unconditionally.
 */
function ExhibitionArticle({ article, lang }) {
  const { data: items } = usePageData(`exhibitionsTimeline:${lang}`, () =>
    apiGet('/articles', { category: 'exhibitions', lang }).then((res) => sortExhibitionsByYear(res.items))
  )
  // `items` starts null while the timeline list is still loading -- the
  // article's own content (already loaded, or this component would not be
  // mounted yet) renders immediately regardless, with the timeline column
  // filling in a moment later, rather than blanking the whole page for that
  // one extra request.
  return <ExhibitionsChrome items={items || []} article={article} />
}

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
export function ArticleDetail({ onTranslatedPath, onExhibitionsLayout }) {
  const { slug } = useParams()
  const { lang, otherLang } = useLang()
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

  // Task 30 (client feedback): reports this article's own category up to
  // PublicLayout (via App.jsx) so it can indent the footer to the content
  // column on an exhibition article page -- an individual article lives at
  // the flat root (/:slug), indistinguishable by URL alone, so this can only
  // be known once the article itself has loaded. Cleared on unmount so a
  // stale "yes, exhibitions" never survives into whatever page is visited
  // next, mirroring onTranslatedPath's own cleanup just above.
  useEffect(() => {
    onExhibitionsLayout?.(article?.category === 'exhibitions')
    return () => onExhibitionsLayout?.(false)
  }, [article, onExhibitionsLayout])

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

  return (
    <Container as="main" className="page-main">
      {article.category === 'exhibitions' ? (
        <ExhibitionArticle article={article} lang={lang} />
      ) : (
        <article><ArticleBody article={article} /></article>
      )}
    </Container>
  )
}
