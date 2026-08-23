import { useEffect, useState } from 'react'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { ArticleGrid } from '@/components/ArticleGrid.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'

const SECTION_LABELS = {
  editions: { fr: 'Éditions', en: 'Editions' },
  'public-orders': { fr: 'Commandes publiques', en: 'Public Orders' },
}

export function Works() {
  const { lang } = useLang()
  const [state, setState] = useState({ works: [], editions: [], 'public-orders': [], intro: null })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiGet('/articles', { category: 'works', lang }),
      apiGet('/articles', { category: 'editions', lang }),
      apiGet('/articles', { category: 'public-orders', lang }),
      apiGet('/pages/works', { lang }),
    ]).then(([works, editions, orders, intro]) => {
      if (cancelled) return
      setState({ works: works.items, editions: editions.items, 'public-orders': orders.items, intro })
    })
    return () => { cancelled = true }
  }, [lang])

  return (
    <Container as="main">
      {state.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={state.intro.blocks} /></section>
      )}

      <ArticleGrid items={state.works} routeKey="works" />

      {['editions', 'public-orders'].map((key) =>
        state[key].length ? (
          <section key={key} className="category-section">
            <h2>{SECTION_LABELS[key][lang]}</h2>
            <ArticleGrid items={state[key]} routeKey="works" />
          </section>
        ) : null
      )}
    </Container>
  )
}
