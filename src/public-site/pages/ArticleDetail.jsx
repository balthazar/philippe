import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../../lib/api.js'
import { useLang } from '../../lib/lang.jsx'
import { routeFor } from '../../lib/routes.js'
import { Container } from '../components/Container.jsx'
import { BlockRenderer } from '../components/BlockRenderer.jsx'

/**
 * The public API always resolves `slug` to the requested language and never
 * exposes the counterpart (locked in Task 9: "every response is
 * language-resolved, plain strings, not {fr, en}"). But GET /articles/:slug
 * matches on slug.fr OR slug.en regardless of the `lang` query param, so
 * re-fetching the same slug with `lang=otherLang` returns the very same
 * article, this time resolved into the other language, including its slug
 * in that language. That's the only field this second fetch is for.
 */
export function ArticleDetail({ routeKey, onTranslatedPath }) {
  const { slug } = useParams()
  const { lang, otherLang, href } = useLang()
  const [article, setArticle] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setArticle(null)

    apiGet(`/articles/${slug}`, { lang })
      .then((data) => {
        if (cancelled) return
        setArticle(data)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus(err?.status === 404 ? 'not-found' : 'error')
      })

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
  }, [slug, lang, otherLang, routeKey])

  if (status === 'loading' || status === 'error') return null

  if (status === 'not-found') {
    return (
      <Container as="main">
        <p>{lang === 'fr' ? 'Page introuvable.' : 'Page not found.'}</p>
      </Container>
    )
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
