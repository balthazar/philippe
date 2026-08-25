import { useState } from 'react'
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
  // `isExhibitionsArticle` is reported up from ArticleDetail (App.jsx
  // threads this the same way as `translatedPath`) once its own fetch
  // resolves -- it is the only way to know a bare `/:slug` is an exhibition
  // rather than a work, the URL alone cannot say. ArticleDetail's own effect
  // (see its file) only ever reports a definite answer, never an
  // intermediate `false` while a new article is loading, so the rail does
  // not flicker off between two exhibitions the way a naive "clear on every
  // unmount" effect would.
  const wantsRail = isIndex || isExhibitionsArticle

  // Sticky, and that is the point. The fetch below is keyed on/off so that a
  // works article never triggers it; but `wantsRail` also dips to false for
  // the few frames between leaving the index and learning the new article's
  // category, and a key that dipped with it would throw the list away and
  // refetch it on the far side of every single navigation.
  //
  // Set during render rather than in an effect: this is derived state, and
  // React re-runs the render with the new value before committing anything,
  // so there is no extra paint and nothing to see.
  const [railEverWanted, setRailEverWanted] = useState(wantsRail)
  if (wantsRail && !railEverWanted) setRailEverWanted(true)

  const timelineKey = `exhibitionsTimeline:${lang}:${railEverWanted ? 'on' : 'off'}`
  const { data: items } = usePageData(timelineKey, () =>
    railEverWanted
      ? apiGet('/articles', { category: 'exhibitions', lang }).then((res) => sortExhibitionsByYear(res.items))
      : Promise.resolve(null)
  )

  // Clicking a dot on the index flips `isIndex` false at once while the new
  // article's category is still unknown, so `wantsRail` alone leaves a gap:
  // the rail UNMOUNTS for those frames and comes back -- 39 dots blinking
  // out and in on the way from one exhibition to the next. Task 32 fixed
  // this between two articles; this is the index-to-article edge it did not
  // reach.
  //
  // The list already in hand answers the question synchronously, with no
  // fetch to wait for: if `items` holds this slug, it is an exhibition. A
  // legacy year URL (/2013) is one by its shape alone and needs no lookup.
  //
  // On a cold load straight to an exhibition's URL there is no list yet, so
  // this falls back to `isExhibitionsArticle` exactly as before and the rail
  // appears once the article resolves. Nothing regresses; the common path
  // simply stops flickering.
  const isKnownExhibitionSlug = Boolean(slug)
    && (YEAR_SLUG_RE.test(slug) || Boolean(items?.some((item) => item.slug === slug)))
  const showRail = wantsRail || isKnownExhibitionSlug

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
        {/*
          Task 36, item 1: the rail moved to the right-hand edge, and the
          point of that move is alignment -- the exhibition title (rendered
          inside this content column) has to start at the same left gutter
          as the "PHILIPPE GRONON" wordmark. Both are the FIRST column of
          their own grid (this one `1fr`, the header's own), reading from
          the same --page-gutter inset, so they can never drift apart. That
          only holds if this content div is the first grid item -- the
          rail, second in the DOM below, occupies the second (fixed-width)
          track. See .exhibitions-layout in base.css for the grid itself.
        */}
        {/*
          The fade lives here, on the column itself, and is deliberately NOT
          keyed. It runs once, when this column first mounts -- arriving in
          the exhibitions section -- which is the only moment its content
          appears out of nothing. Moving between two exhibitions after that
          is served from usePageData's cache on the first commit, so there is
          no blank frame there to fade back in from.

          Keying it per article would look equivalent and would not be: it
          would remount <Outlet/> on every navigation, and ArticleDetail's
          unmount cleanup reports `onExhibitionsLayout(false)` -- which would
          flicker the rail off and on again between every pair of
          exhibitions, the exact fault task 32 exists to have fixed.
        */}
        <div className={showRail ? 'exhibitions-content page-fade-in' : 'page-fade-in'}>
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
        {showRail && <ExhibitionsTimeline items={items || []} currentSlug={currentSlug} currentYear={currentYear} />}
      </div>
    </Container>
  )
}
