import { useEffect, useState } from 'react'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { ArticleGrid } from '@/components/ArticleGrid.jsx'
import { Slideshow } from '@/components/Slideshow.jsx'

const SELECTION_LABEL = { fr: 'Œuvres récentes', en: 'Recent works' }

export function Home() {
  const { lang } = useLang()
  const [state, setState] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([apiGet('/home', { lang }), apiGet('/pages/home', { lang })]).then(([home, page]) => {
      if (cancelled) return
      setState({ slides: home.slides, intro: page })
    })
    return () => { cancelled = true }
  }, [lang])

  // While loading, render nothing rather than a spinner.
  if (!state) return null

  return (
    <Container as="main">
      <Slideshow slides={state.slides} />

      {state.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={state.intro.blocks} /></section>
      )}

      {state.slides.length > 0 && (
        <section className="category-section">
          <h2>{SELECTION_LABEL[lang]}</h2>
          <ArticleGrid items={state.slides.map((slide) => slide.article)} routeKey="works" />
        </section>
      )}
    </Container>
  )
}
