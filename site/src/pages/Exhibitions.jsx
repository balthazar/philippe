import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { ArticleBody } from '@/components/ArticleBody.jsx'
import { sortExhibitionsByYear } from '@/lib/exhibitionsOrder.js'
import { usePageTitle } from '@/lib/usePageTitle.js'
import { staticPageTitle } from '@/lib/pageTitle.js'

/**
 * Task 28, part 3: /expositions no longer shows a flat grid of every
 * exhibition. Every exhibition article is already titled by its year (1989
 * to 2024), so that list, sorted by year, becomes a timeline down the left;
 * the most recent year's own article content renders on the right, exactly
 * the way that same year's own page (ArticleDetail) renders it.
 *
 * Task 32, item 1: the timeline rail and the `<main>` around it are no
 * longer rendered here -- ExhibitionsLayout.jsx (a route parent, see
 * App.jsx) renders them once and never unmounts them while navigating; this
 * component, reached through its `<Outlet/>`, renders only the section's
 * own intro copy and the current year's own content. Every existing
 * article URL (/2023, /1989, ...) is untouched.
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
  usePageTitle(data && staticPageTitle(data.intro?.title))

  // Task 26, correction to B4's original reasoning no longer applies here
  // the same way -- ExhibitionsLayout's own `<main>` already reserves the
  // page's height regardless of this component's own loading state -- but
  // rendering nothing while `data` is null still avoids a flash of
  // undefined/partial content.
  if (!data) return null

  return (
    <>
      {data.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={data.intro.blocks} /></section>
      )}

      {data.current && <ArticleBody article={data.current} />}
    </>
  )
}
