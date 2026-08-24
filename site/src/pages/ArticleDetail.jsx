import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { routeFor } from '@/routes.js'
import { ArticleBody } from '@/components/ArticleBody.jsx'
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
 *
 * Task 32, item 1: `:slug` is now always reached through ExhibitionsLayout.jsx
 * (a nested layout route -- see App.jsx), which owns the persistent
 * `<main class="page-main">` for every article, work or exhibition alike.
 * This component therefore never renders its own `<main>`/Container any
 * more -- it used to, and briefly still did during this task, but that
 * doubled up with ExhibitionsLayout's own `<main>` and (worse) made
 * ArticleDetail's own mount depend on `isExhibitionsArticle`, which
 * ArticleDetail itself sets: toggling it moved `<Outlet/>` to a different
 * position in ExhibitionsLayout's tree, which unmounted and remounted this
 * component, which reset the flag on unmount, which moved `<Outlet/>` back
 * -- an infinite loop. See ExhibitionsLayout.jsx's own comment for the full
 * account.
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
  // App.jsx so PublicLayout can indent the footer, and ExhibitionsLayout can
  // show/hide the rail, on an exhibition article page -- an individual
  // article lives at the flat root (/:slug), indistinguishable by URL
  // alone, so this can only be known once the article itself has loaded.
  //
  // Task 32, item 1: this ONLY ever reports a definite, freshly-loaded
  // answer -- never an intermediate `false` while a new article is loading.
  // The previous version fired `onExhibitionsLayout(false)` on every single
  // dependency change (both the new effect body running with `article`
  // still null, AND the old effect's own cleanup), which flipped the flag
  // false and back true on EVERY navigation, even between two exhibition
  // years -- exactly the flicker this task exists to remove, since
  // ExhibitionsLayout uses this same flag to decide whether to render the
  // rail at all. A genuine unmount (leaving the exhibitions section
  // entirely for a page that isn't `:slug` at all) is handled by the
  // second effect below instead, which never fires on a mere param change.
  useEffect(() => {
    if (article) onExhibitionsLayout?.(article.category === 'exhibitions')
  }, [article, onExhibitionsLayout])

  useEffect(() => () => onExhibitionsLayout?.(false), [onExhibitionsLayout])

  // `article` is checked before `error` as belt and braces. usePageData now
  // resets both synchronously on a key change, so a stale error from a
  // previous slug can no longer survive into a new one; this ordering simply
  // costs nothing and keeps the success path the one that wins.
  if (!article) {
    if (error?.status === 404) {
      return <p>{lang === 'fr' ? 'Page introuvable.' : 'Page not found.'}</p>
    }
    // Task 26, correction to B4's original reasoning ("reserve the page's
    // minimum height while loading") is now handled by ExhibitionsLayout's
    // own always-present `<main>`, one level up, rather than here -- an
    // aria-busy marker on this region is still useful in its own right, so
    // it stays, just no longer paired with a landmark this component
    // doesn't own any more.
    return <div aria-busy="true" />
  }

  return article.category === 'exhibitions' ? (
    <ArticleBody article={article} />
  ) : (
    <article><ArticleBody article={article} /></article>
  )
}
