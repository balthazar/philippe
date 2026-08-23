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

  // While loading, render nothing rather than a spinner.
  if (!state) return null

  return (
    <main>
      {/* Full bleed: rendered outside the gutter Container on purpose, per
          the client's request that the slideshow span edge to edge. */}
      <Slideshow slides={state.slides} />

      {state.intro?.blocks?.length > 0 && (
        <Container>
          <section className="page-intro"><BlockRenderer blocks={state.intro.blocks} /></section>
        </Container>
      )}
    </main>
  )
}
