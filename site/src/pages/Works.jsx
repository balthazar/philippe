import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { ArticleGrid } from '@/components/ArticleGrid.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'

const SECTION_LABELS = {
  editions: { fr: 'Éditions', en: 'Editions' },
  'public-orders': { fr: 'Commandes publiques', en: 'Public Orders' },
}

export function Works() {
  const { lang } = useLang()
  const { data } = usePageData(`works:${lang}`, async () => {
    const [works, editions, orders, intro] = await Promise.all([
      apiGet('/articles', { category: 'works', lang }),
      apiGet('/articles', { category: 'editions', lang }),
      apiGet('/articles', { category: 'public-orders', lang }),
      apiGet('/pages/works', { lang }),
    ])
    return { works: works.items, editions: editions.items, 'public-orders': orders.items, intro }
  })

  // Task 26, correction to B4: this page previously had no loading guard at
  // all, painting an empty grid immediately -- indistinguishable from a
  // genuinely empty category, and the cause of the same footer-riding-up
  // jump the brief described for the homepage. `data` (not a defaulted
  // `state`) is the loading/loaded distinction: while it's null, render a
  // reserved-height placeholder and no grid at all; once it resolves, even
  // to an empty result, render the real (possibly empty) grid.
  if (!data) return <Container as="main" className="page-main" aria-busy="true" />

  return (
    <Container as="main" className="page-main">
      {data.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={data.intro.blocks} /></section>
      )}

      <ArticleGrid items={data.works} routeKey="works" />

      {['editions', 'public-orders'].map((key) =>
        data[key].length ? (
          <section key={key} className="category-section">
            <h2>{SECTION_LABELS[key][lang]}</h2>
            <ArticleGrid items={data[key]} routeKey="works" />
          </section>
        ) : null
      )}
    </Container>
  )
}
