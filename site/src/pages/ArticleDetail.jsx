import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { routeFor } from '@/routes.js'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'

/**
 * The public API always resolves `slug` to the requested language and never
 * exposes the counterpart (locked in Task 9: "every response is
 * language-resolved, plain strings, not {fr, en}"). But GET /articles/:slug
 * matches on slug.fr OR slug.en regardless of the `lang` query param, so
 * re-fetching the same slug with `lang=otherLang` returns the very same
 * article, this time resolved into the other language, including its slug
 * in that language. That's the only field this second fetch is for, so it
 * stays a plain effect rather than going through usePageData: it drives the
 * header's language-toggle href, not this page's own content.
 */
export function ArticleDetail({ routeKey, onTranslatedPath }) {
  const { slug } = useParams()
  const { lang, otherLang, href } = useLang()
  const { data: article, error } = usePageData(`article:${routeKey}:${slug}:${lang}`, () =>
    apiGet(`/articles/${slug}`, { lang })
  )

  useEffect(() => {
    let cancelled = false

    apiGet(`/articles/${slug}`, { lang: otherLang })
      .then((data) => {
        if (cancelled) return
        onTranslatedPath?.(routeFor(routeKey, otherLang, data.slug))
      })
      .catch(() => {})

    return () => {
      cancelled = true
      onTranslatedPath?.(null)
    }
  }, [slug, otherLang, routeKey])

  // `article` is checked before `error`: usePageData does not clear a stale
  // error from a previous key when a later fetch for a new key succeeds, so
  // checking data first is what keeps a slug change from one that 404s to
  // one that exists from getting stuck showing "not found".
  if (!article) {
    if (error?.status === 404) {
      return (
        <Container as="main">
          <p>{lang === 'fr' ? 'Page introuvable.' : 'Page not found.'}</p>
        </Container>
      )
    }
    return null
  }

  return (
    <Container as="main">
      <article>
        <header className="article-header">
          <h1>{article.title}</h1>
          {article.yearLabel && <p className="article-year">{article.yearLabel}</p>}
        </header>

        <BlockRenderer blocks={article.blocks} />

        <nav className="article-pager" aria-label={lang === 'fr' ? 'Navigation entre œuvres' : 'Article navigation'}>
          {article.prev && (
            <Link to={href(routeKey, article.prev.slug)} rel="prev">
              {lang === 'fr' ? 'Précédent' : 'Previous'}
            </Link>
          )}
          {article.next && (
            <Link to={href(routeKey, article.next.slug)} rel="next">
              {lang === 'fr' ? 'Suivant' : 'Next'}
            </Link>
          )}
        </nav>
      </article>
    </Container>
  )
}
