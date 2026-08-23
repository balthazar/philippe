import { useEffect, useState } from 'react'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { Slideshow } from '@/components/Slideshow.jsx'

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
