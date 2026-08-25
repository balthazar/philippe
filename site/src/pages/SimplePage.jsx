import { Link } from 'react-router-dom'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { Container } from '@/components/Container.jsx'
import { BlockRenderer } from '@/components/BlockRenderer.jsx'
import { usePageTitle } from '@/lib/usePageTitle.js'
import { staticPageTitle } from '@/lib/pageTitle.js'

// Task 33: the retired site-wide footer's contents, now the contact page's
// own colophon (see ColophonLinks below) -- moved, not duplicated: this is
// the one place these links render now.
//
// Client feedback: Bibliographie has since left this list for the header's
// own Bio/Bibliographie nav slot (see Header.jsx). It is a section in its
// own right, reachable from every page, so listing it here as well would
// be a second route to it from the one page that already links everything
// else.
//
// Liens followed it, for a different reason: its content now lives inside
// the bibliography page as that page's own "Liens" subsection, so this
// entry pointed at a second, duplicate copy of it. The /liens route and its
// page record are deliberately left in place rather than deleted -- the
// content was moved by a one-off script against the production database, so
// keeping the source reachable by URL is what makes that move reversible
// without a restore. Nothing links to it.
//
// Mentions légales stays: it has no nav slot and no other home.
const COLOPHON_LINKS = [
  { key: 'legal', fr: 'Mentions légales', en: 'Terms and Conditions' },
]

// The address (BlockRenderer's own mailto block, rendered by the caller)
// is the page; this is what used to be <Footer>, now quietly set beneath
// it instead of spanning the whole site. Same content, same localization
// rule as every other nav label: read from `lang` via useLang() below.
function ColophonLinks() {
  const { lang, href } = useLang()
  return (
    <div className="contact-colophon">
      <nav aria-label={lang === 'fr' ? 'Pied de page' : 'Footer'}>
        {COLOPHON_LINKS.map((item) => (
          <Link key={item.key} to={href(item.key)}>{item[lang]}</Link>
        ))}
      </nav>
      <p className="colophon">&copy; Philippe Gronon</p>
    </div>
  )
}

// Backs biography, contact, bibliography, links and legal. Fetches
// /pages/:key and renders the title plus BlockRenderer. The title is placed
// as JSX text (React escapes it), never dangerouslySetInnerHTML: `heading`
// blocks are not sanitized server-side, and neither is a page title, so
// nothing on this page bypasses React's default escaping.
export function SimplePage({ pageKey }) {
  const { lang } = useLang()
  const { data: page } = usePageData(`page:${pageKey}:${lang}`, () => apiGet(`/pages/${pageKey}`, { lang }))

  // Coordinator feedback (task 27): keeps the tab title right after
  // hydration and on every later client-side navigation, using the exact
  // same formatter prerender/index.js's headFor() does. Called before the
  // loading early-return below (Rules of Hooks); falsy while `page` hasn't
  // loaded yet, which usePageTitle treats as "leave the previous title".
  usePageTitle(page && staticPageTitle(page.title))

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

  // D2 dropped the page-level heading on Contact alone: the header already
  // marks Contact as the current section (its nav link is .active), so
  // repeating "Contact" as an h1 said nothing the chrome had not. Client
  // feedback extends that to every simple page -- bio and bibliography have
  // the same nav marker, and the client made the same call for links and
  // legal, which do not. So there is no `pageKey` test left here at all:
  // none of these pages prints its own title, and `page.title` is now used
  // only for the tab title (usePageTitle above), never in the page body.
  //
  // Note this leaves links and legal with no h1 at all, and no active nav
  // link either -- they are reachable only from the contact colophon. Their
  // first heading, if any, is whatever their own blocks carry.
  // Keyed on the page and language so the fade re-runs when the content
  // genuinely changes, and on nothing else. `.page-main` itself is NOT what
  // fades: it is the shell that reserves the page's height while loading
  // (see the early return above), and fading the shell would fade the
  // reserved space in from nothing, which is the flash this replaces.
  return (
    <Container as="main" className={className}>
      <div key={`${pageKey}:${lang}`} className="page-fade-in">
        <BlockRenderer blocks={page.blocks} />
        {pageKey === 'contact' && <ColophonLinks />}
      </div>
    </Container>
  )
}
