import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { Slideshow } from '@/components/Slideshow.jsx'

export function Home() {
  const { lang } = useLang()
  const { data: state } = usePageData(`home:${lang}`, async () => {
    const [home, page] = await Promise.all([apiGet('/home', { lang }), apiGet('/pages/home', { lang })])
    return { slides: home.slides, intro: page }
  })

  return (
    <main>
      {/* Full bleed: rendered outside the gutter Container on purpose, per
          the client's request that the slideshow span edge to edge.

          While loading, this reuses .slideshow's own height rule
          (calc(100dvh - header height), already known before the fetch
          resolves) as an empty placeholder, rather than returning null: the
          page never collapses to nothing, so there's no jump to mask with a
          spinner or a fade once the real slideshow replaces it. */}
      {state ? <Slideshow slides={state.slides} /> : <div className="slideshow" aria-hidden="true" />}

      {state?.intro?.blocks?.length > 0 && (
        <Container>
          <section className="page-intro"><BlockRenderer blocks={state.intro.blocks} /></section>
        </Container>
      )}
    </main>
  )
}
