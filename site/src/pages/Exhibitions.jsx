import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { ArticleGrid } from '@/components/ArticleGrid.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { usePageTitle } from '@/lib/usePageTitle.js'
import { staticPageTitle } from '@/lib/pageTitle.js'

// Works.jsx without the extra category sections: a flat grid, newest first.
// The API already sorts /articles by position asc, yearStart desc,
// createdAt desc (api/src/routes/public.js), so no client-side sort here.
export function Exhibitions() {
  const { lang } = useLang()
  const { data } = usePageData(`exhibitions:${lang}`, async () => {
    const [exhibitions, intro] = await Promise.all([
      apiGet('/articles', { category: 'exhibitions', lang }),
      apiGet('/pages/exhibitions', { lang }),
    ])
    return { items: exhibitions.items, intro }
  })

  // Coordinator feedback (task 27): same reasoning as Works.jsx.
  usePageTitle(data?.intro?.title && staticPageTitle(data.intro.title))

  // Task 26, correction to B4: see the identical guard in Works.jsx -- a
  // still-loading page reserves space and renders no grid; a loaded but
  // genuinely empty category renders the real (empty) grid, so the two are
  // never indistinguishable.
  if (!data) return <Container as="main" className="page-main" aria-busy="true" />

  return (
    <Container as="main" className="page-main">
      {data.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={data.intro.blocks} /></section>
      )}

      <ArticleGrid items={data.items} routeKey="exhibitions" />
    </Container>
  )
}
