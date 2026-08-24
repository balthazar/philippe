import { Outlet, useLocation, useParams } from 'react-router-dom'
import { apiGet } from '@/api.js'
import { useLang } from '@/lang.jsx'
import { usePageData } from '@/preload.jsx'
import { SEGMENTS } from '@/routes.js'
import { Container } from './Container.jsx'
import { ExhibitionsTimeline } from './ExhibitionsTimeline.jsx'
import { sortExhibitionsByYear } from '@/lib/exhibitionsOrder.js'

// Task 33, section 3: the only shape the 25 legacy exhibition-year URLs
// ever had. Shared with ArticleDetail.jsx's own fallback for those URLs --
// keep the two definitions in agreement.
const YEAR_SLUG_RE = /^\d{4}$/

/**
 * Task 32, item 1: a nested layout route for the whole exhibitions section,
 * replacing ExhibitionsChrome (retired). Previously the timeline was
 * rendered INSIDE the page components (ArticleDetail.jsx, Exhibitions.jsx),
 * so it unmounted and remounted on every navigation between exhibition
 * years: `usePageData` resets its data to null synchronously the moment the
 * `:slug` param changes (see preload.jsx), and the page component rendered
 * an aria-busy placeholder in its place for that instant -- which, being a
 * different subtree, unmounted whatever chrome had been nested inside it,
 * timeline included. Client-visible as a full-page flicker and the rail
 * "resettling" instead of holding still.
 *
 * This component is that chrome, hoisted one level up into a route of its
 * own -- mirroring PublicLayout in App.jsx, which wraps the entire public
 * route tree in Header/Footer around one persistent `<Outlet/>` the same
 * way. `:slug` is shared by works and exhibition articles alike (Task 27,
 * Part A put every article at the flat root), so this layout necessarily
 * wraps both; `showRail` below is what keeps a work article's page looking
 * exactly as before (no rail, no extra fetch).
 *
 * `<Outlet/>` is rendered at the exact same tree position -- Container >
 * (a plain wrapping div, class toggled) > (a plain content div, class
 * toggled) > Outlet -- REGARDLESS of `showRail`. An earlier version of this
 * component instead branched between returning a bare `<Outlet/>` and
 * returning it several levels deeper inside the rail markup; toggling
 * `showRail` therefore moved `<Outlet/>` to a different position in the
 * rendered tree each time, which is indistinguishable from "a different
 * component" to React's reconciler -- it unmounted and remounted
 * ArticleDetail on every single toggle. Combined with ArticleDetail's own
 * unmount-cleanup effect (which reports `isExhibitionsArticle` back to
 * false), that produced a genuine infinite loop: mount -> article loads ->
 * reports true -> showRail flips true -> Outlet's position shifts ->
 * ArticleDetail unmounts -> cleanup reports false -> showRail flips false
 * -> Outlet's position shifts back -> ArticleDetail remounts -> repeat,
 * visible as an unbounded stream of repeated `/articles/:slug` requests and
 * a page that never finishes loading. Keeping Outlet's ancestry constant
 * and only toggling classnames/siblings around it is what keeps this
 * component's own persistence promise from undermining itself.
 */
export function ExhibitionsLayout({ isExhibitionsArticle }) {
  const { lang } = useLang()
  const { pathname } = useLocation()
  // useParams() always resolves against the DEEPEST matched route, not the
  // component's own position in the tree (see react-router's implementation:
  // it reads matches[matches.length - 1]), so this layout -- rendered above
  // the `:slug` route -- still reads the article's own slug directly. That
  // makes the current dot knowable the instant the URL changes, with no
  // dependency on ArticleDetail's own (async, per-article) data fetch at all.
  const { slug } = useParams()

  const isIndex = pathname === `/${SEGMENTS.exhibitions.fr}` || pathname === `/en/${SEGMENTS.exhibitions.en}`
  // `isExhibitionsArticle` is reported up from ArticleDetail (App.jsx thread
  // this the same way as `translatedPath`) once its own fetch resolves --
  // it is the only way to know a bare `/:slug` is an exhibition rather than
  // a work, the URL alone cannot say. ArticleDetail's own effect (see its
  // file) is written to only ever report a definite answer, never an
  // intermediate `false` while a new article is loading, so this does not
  // flicker the rail off between two exhibition years the way a naive
  // "clear on every unmount" effect would.
  const showRail = isIndex || isExhibitionsArticle

  // The key includes whether the rail is actually wanted so a work article
  // never triggers this fetch (guarded below by the fetcher itself, and
  // this project has a test asserting exactly that -- see
  // ArticleDetail.test.jsx). The moment `showRail` flips from false to true
  // (landing on the exhibitions section for the first time this session)
  // the key changes, which is what makes usePageData actually run the real
  // fetch then, rather than being stuck with whatever the key resolved to
  // on first mount.
  const timelineKey = `exhibitionsTimeline:${lang}:${showRail ? 'on' : 'off'}`
  const { data: items } = usePageData(timelineKey, () =>
    showRail
      ? apiGet('/articles', { category: 'exhibitions', lang }).then((res) => sortExhibitionsByYear(res.items))
      : Promise.resolve(null)
  )

  // On an article page the URL's own slug is the current dot. On the
  // /expositions index there is no slug at all -- the most recent year
  // (items are sorted newest-first, lib/exhibitionsOrder.js) is "current",
  // matching Exhibitions.jsx's own choice of which article to show.
  //
  // Task 33, section 3: the timeline marks a whole YEAR current now, not one
  // exhibition slug (a year can hold more than one exhibition, so there is
  // no longer a single slug a year-level dot could match). A legacy year URL
  // (/2013 -- see ArticleDetail.jsx's own YEAR_SLUG_RE fallback) IS the year
  // itself, read directly with no lookup needed; a real exhibition slug's
  // year comes from `items`, the same list the rail already fetched.
  const currentSlug = slug || items?.[0]?.slug
  const currentYear = slug && YEAR_SLUG_RE.test(slug)
    ? Number(slug)
    : items?.find((item) => item.slug === currentSlug)?.yearStart

  return (
    <Container as="main" className="page-main">
      <div className={showRail ? 'exhibitions-layout' : undefined}>
        {showRail && <ExhibitionsTimeline items={items || []} currentSlug={currentSlug} currentYear={currentYear} />}
        <div className={showRail ? 'exhibitions-content' : undefined}>
          {/*
            Task 33, section 3: hands the already-fetched exhibitions list
            down to ArticleDetail via route context, so its own legacy-year
            fallback (a slug shaped like a year, once its direct article
            fetch 404s) can list that year's exhibitions without a second,
            redundant fetch of the exact same data this component already
            has.
          */}
          <Outlet context={items} />
        </div>
      </div>
    </Container>
  )
}
