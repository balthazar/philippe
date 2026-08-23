import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { ExhibitionsChrome } from '@/components/ExhibitionsChrome.jsx'
import { sortExhibitionsByYear } from '@/lib/exhibitionsOrder.js'
import { usePageTitle } from '@/lib/usePageTitle.js'
import { staticPageTitle } from '@/lib/pageTitle.js'

/**
 * Task 28, part 3: /expositions no longer shows a flat grid of every
 * exhibition. Every exhibition article is already titled by its year (1989
 * to 2024), so that list, sorted by year, becomes a timeline down the left;
 * the most recent year's own article content renders on the right, exactly
 * the way that same year's own page (ArticleDetail) renders it -- see
 * ExhibitionsChrome, the wrapper both share. Every existing article URL
 * (/2023, /1989, ...) is untouched.
 */
export function Exhibitions() {
  const { lang } = useLang()
  const { data } = usePageData(`exhibitions:${lang}`, async () => {
    const [list, intro] = await Promise.all([
      apiGet('/articles', { category: 'exhibitions', lang }),
      apiGet('/pages/exhibitions', { lang }),
    ])
    const items = sortExhibitionsByYear(list.items)
    const current = items[0] ? await apiGet(`/articles/${items[0].slug}`, { lang }) : null
    return { items, intro, current }
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

      {data.current && <ExhibitionsChrome items={data.items} article={data.current} />}
    </Container>
  )
}
