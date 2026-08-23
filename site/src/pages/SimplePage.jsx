import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'

// Backs biography, contact, bibliography, links and legal. Fetches
// /pages/:key and renders the title plus BlockRenderer. The title is placed
// as JSX text (React escapes it), never dangerouslySetInnerHTML: `heading`
// blocks are not sanitized server-side, and neither is a page title, so
// nothing on this page bypasses React's default escaping.
export function SimplePage({ pageKey }) {
  const { lang } = useLang()
  const { data: page } = usePageData(`page:${pageKey}:${lang}`, () => apiGet(`/pages/${pageKey}`, { lang }))

  // Task 26, correction to B4: reserve the page's minimum height while
  // loading instead of rendering nothing, so the footer never rides up.
  // Every public page shares .page-main; see base.css.
  if (!page) return <Container as="main" className="page-main" aria-busy="true" />

  // Task 26, part B3: a page reduced to a single block (currently only
  // /contact, after the migration strips it down to its mailto) is centred
  // both ways in the page. Keyed to block count, not to which page this is,
  // so it is never "if pageKey === 'contact'" here.
  const isSingleBlock = page.blocks.length === 1
  const className = `page-main${isSingleBlock ? ' page-main-centered' : ''}`

  // D2: the header already marks Contact as the current section (its nav
  // link is .active), so a page-level "Contact" heading is redundant --
  // just the email, centred (page-main-centered above already handles the
  // centring, keyed to Contact's single mailto block).
  return (
    <Container as="main" className={className}>
      {pageKey !== 'contact' && <h1>{page.title}</h1>}
      <BlockRenderer blocks={page.blocks} />
    </Container>
  )
}
