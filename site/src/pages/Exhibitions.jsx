import { useEffect, useState } from 'react'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { ArticleGrid } from '@/components/ArticleGrid.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'

// Works.jsx without the extra category sections: a flat grid, newest first.
// The API already sorts /articles by position asc, yearStart desc,
// createdAt desc (api/src/routes/public.js), so no client-side sort here.
export function Exhibitions() {
  const { lang } = useLang()
  const [state, setState] = useState({ items: [], intro: null })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiGet('/articles', { category: 'exhibitions', lang }),
      apiGet('/pages/exhibitions', { lang }),
    ]).then(([exhibitions, intro]) => {
      if (cancelled) return
      setState({ items: exhibitions.items, intro })
    })
    return () => { cancelled = true }
  }, [lang])

  return (
    <Container as="main">
      {state.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={state.intro.blocks} /></section>
      )}

      <ArticleGrid items={state.items} routeKey="exhibitions" />
    </Container>
  )
}
