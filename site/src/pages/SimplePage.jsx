import { useEffect, useState } from 'react'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'

// Backs biography, contact, bibliography, links and legal. Fetches
// /pages/:key and renders the title plus BlockRenderer. The title is placed
// as JSX text (React escapes it), never dangerouslySetInnerHTML: `heading`
// blocks are not sanitized server-side, and neither is a page title, so
// nothing on this page bypasses React's default escaping.
export function SimplePage({ pageKey }) {
  const { lang } = useLang()
  const [page, setPage] = useState(null)

  useEffect(() => {
    let cancelled = false
    setPage(null)
    apiGet(`/pages/${pageKey}`, { lang }).then((data) => {
      if (cancelled) return
      setPage(data)
    })
    return () => { cancelled = true }
  }, [pageKey, lang])

  if (!page) return null

  return (
    <Container as="main">
      <h1>{page.title}</h1>
      <BlockRenderer blocks={page.blocks} />
    </Container>
  )
}
