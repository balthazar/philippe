import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SEGMENTS, routeFor } from '../src/routes.js'
import { SITE_NAME, HOME_TITLE, articlePageTitle, staticPageTitle } from '../src/lib/pageTitle.js'

// 8080 is the in-cluster port production uses (Traefik ingress routes /api
// there). Locally the API runs on 8090 (site/vite.config.js's dev proxy
// comment explains why 8080 is taken on this machine): set
// PRERENDER_API_URL=http://localhost:8090/api when running this locally.
const API = process.env.PRERENDER_API_URL || 'http://localhost:8080/api'
const SITE = process.env.SITE_URL || 'https://philippe.balthazar.dev'
const DIST = 'dist'

const CATEGORIES = ['works', 'exhibitions', 'editions', 'public-orders']
// 'home' is deliberately excluded from the pageKeys handed to collectRoutes
// (below): SEGMENTS.home is {fr: '', en: ''} and '/' + '/en' are already
// seeded directly, so adding it there would emit a spurious '/en/' route.
// It is still fetched into content.pages for headFor's title/description.
const PAGE_KEYS = ['works', 'exhibitions', 'biography', 'contact', 'bibliography', 'links', 'legal']
const CONTENT_PAGE_KEYS = ['home', ...PAGE_KEYS]

// Task 27, Part A (SEO-critical): individual articles move to the root --
// /:slug in French, /en/:slug in English -- to match the URLs the site
// being replaced served (works and exhibitions share this one flat
// namespace; `category` no longer selects a URL segment at all). Section
// listings (works, exhibitions, ...) are unaffected and keep their own
// segment via SEGMENTS below.
export function collectRoutes({ articles, pageKeys }) {
  const routes = ['/', '/en']
  for (const key of pageKeys) {
    routes.push(`/${SEGMENTS[key].fr}`, `/en/${SEGMENTS[key].en}`)
  }
  for (const a of articles) {
    if (a.slug?.fr) routes.push(`/${a.slug.fr}`)
    // Slug is the one localized field that didn't already follow the
    // `en || fr` rule every other field on this project uses (client
    // feedback, task 25): a blank English slug used to skip the English
    // route entirely, so the article existed with no static EN page and no
    // hreflang for it, reachable only by typing the French slug under /en/
    // by hand (the public API's $or slug lookup already resolves that).
    const enSlug = a.slug?.en || a.slug?.fr
    if (enSlug) routes.push(`/en/${enSlug}`)
  }
  return [...new Set(routes)]
}

// SITE_NAME imported from src/lib/pageTitle.js (shared with the runtime).
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const routeLang = (route) => (route === '/en' || route.startsWith('/en/') ? 'en' : 'fr')

// Reads one language out of a {fr, en} localized field, falling back to
// French, and always to '' (never to the field object itself: title/
// yearLabel/seoDescription/etc. can legitimately be empty in both languages
// at once, e.g. an admin who never filled in seoDescription, and `x.fr ||
// x.en || x` would then return the {fr, en} object itself, since an object
// is truthy even when both its fields are '' -- caught in manual QA as a
// literal "[object Object]" in a prerendered <meta> tag).
const localize = (field, lang) => (typeof field === 'string' ? field : field?.[lang] || field?.fr || '')

// Maps a non-article route back to the pageKey whose /pages/:key content
// (title, seoDescription) it should carry, or null for anything unknown
// (matches SEGMENTS, the single source of truth for the URL scheme).
function pageKeyForRoute(route) {
  if (route === '/' || route === '/en') return 'home'
  for (const key of Object.keys(SEGMENTS)) {
    if (key === 'home') continue
    const seg = SEGMENTS[key]
    if (route === `/${seg.fr}` || route === `/en/${seg.en}`) return key
  }
  return null
}

// Shared by headFor and preloadFor: which merged article record (if any) a
// route belongs to. A route matches on either language's slug, since the fr
// and en URLs for the same article share nothing but that slug segment.
function findArticleMatch(route, content) {
  return (content.articles || []).find(
    (a) => route.endsWith(`/${a.slug?.fr}`) || (a.slug?.en && route.endsWith(`/${a.slug.en}`))
  )
}

/** Builds the per-route head tags: title, description, canonical, hreflang, OG. */
export function headFor(route, content, site = SITE) {
  const lang = routeLang(route)
  const match = findArticleMatch(route, content)

  const tags = []
  let description = ''

  if (match) {
    const title = localize(match.title, lang)
    const year = localize(match.yearLabel, lang)
    tags.push(`<title>${esc(articlePageTitle(title, year))}</title>`)
    description = localize(match.seoDescription, lang)

    // Task 27, Part A: articles live at the root now, so their hreflang
    // alternates do too -- no section segment, in either language.
    if (match.slug?.fr) {
      tags.push(`<link rel="alternate" hreflang="fr" href="${site}/${match.slug.fr}">`)
    }
    // Same `en || fr` fallback as collectRoutes above, so the hreflang
    // alternate always agrees with which routes actually got prerendered.
    const enSlug = match.slug?.en || match.slug?.fr
    if (enSlug) {
      tags.push(`<link rel="alternate" hreflang="en" href="${site}/en/${enSlug}">`)
    }
    const cover = match.cover?.variants?.medium?.path
    if (cover) tags.push(`<meta property="og:image" content="${site}/media/${cover}">`)
  } else {
    const pageKey = pageKeyForRoute(route)
    const page = pageKey && content.pages?.[pageKey]
    // D4: the home route's title is literally "Philippe Gronon", never
    // "<page title> | Philippe Gronon" -- every other route gets the
    // suffixed form.
    if (pageKey === 'home') {
      tags.push(`<title>${esc(HOME_TITLE)}</title>`)
      description = page ? localize(page.seoDescription, lang) : ''
    } else if (page) {
      const title = localize(page.title, lang)
      tags.push(`<title>${esc(staticPageTitle(title))}</title>`)
      description = localize(page.seoDescription, lang)
    } else {
      tags.push(`<title>${esc(HOME_TITLE)}</title>`)
    }
  }

  if (description) {
    tags.push(`<meta name="description" content="${esc(description)}">`)
    tags.push(`<meta property="og:description" content="${esc(description)}">`)
  }

  tags.push(`<link rel="canonical" href="${site}${route}">`)
  tags.push(`<meta property="og:site_name" content="${SITE_NAME}">`)
  tags.push(`<meta property="og:url" content="${site}${route}">`)
  return tags.join('\n')
}

// Fix round 1: an article page's language-toggle link (Header, via
// ArticleDetail's onTranslatedPath) used to be wrong in the prerendered HTML
// until a client-side effect corrected it after hydration, because the
// counterpart slug was only ever known at fetch time, never at render time.
// But headFor's `content.articles` already carries both languages' slugs for
// every article (see mergeArticleLists below), so the counterpart route can
// be computed here and handed to entry-server.jsx's render() as preload data,
// under the exact key ArticleDetail's usePageData call reads
// (`translatedPath:<slug>:<lang>`). See src/main.jsx for how this
// same value reaches the client at hydration time (window.__PRELOAD__), which
// is what keeps this from becoming a hydration mismatch instead of a fix.
//
// Task 27, Part A: the key used to be namespaced by section
// (`translatedPath:<section>:<slug>:<lang>`), because the URL itself carried
// the section. Articles now live at the root, in one flat slug namespace
// shared by every category, so the section is no longer known (or needed) to
// look this up -- keyed on the slug alone, which is already globally unique.
export function preloadFor(route, content) {
  const lang = routeLang(route)
  const match = findArticleMatch(route, content)
  if (!match) return {}

  const otherLang = lang === 'fr' ? 'en' : 'fr'
  // Same `en || fr` fallback as collectRoutes/headFor above: when the
  // English slug is blank, the EN route collectRoutes actually generated
  // uses the French slug string in the URL, so `ownSlug` has to match that
  // real URL segment (what ArticleDetail's useParams().slug will actually
  // be) rather than the blank raw field -- otherwise this key would never
  // match the one ArticleDetail looks up, silently dropping the preload for
  // exactly the route this fix exists for.
  const resolveSlug = (l) => match.slug?.[l] || match.slug?.fr
  const ownSlug = resolveSlug(lang)
  const otherSlug = resolveSlug(otherLang)
  if (!ownSlug || !otherSlug) return {}

  // `routeFor`'s first argument only ever matters when there's no slug (it
  // selects a section's segment); with `otherSlug` given, the article always
  // resolves to the flat root URL regardless of that argument.
  return { [`translatedPath:${ownSlug}:${lang}`]: routeFor('article', otherLang, otherSlug) }
}

// `<` -> < also escapes `</script>`, so embedded preload JSON can't
// terminate the script tag it's embedded in (or smuggle markup into it).
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

// Pure string transform, unit-tested directly (prerender/__tests__/routes.test.js)
// against generated-file contents rather than a live `document`: an earlier
// <html lang> test on this project passed for the wrong reason because it
// read a shared `document` that state bled into between cases. This has no
// such shared, mutable state to bleed.
// Strips any <title> already in the template (index.html now carries its
// own default, so there is a sensible value before React mounts -- see
// index.html itself) before a caller injects its own. Without this, the
// route-specific title `head`/`extra` carries would be a SECOND <title> in
// <head>, and per the DOM/HTML spec `document.title` -- and what a crawler
// that never runs JS indexes -- reads the FIRST <title> in the document,
// not the last. That would silently make the generic default win over the
// real, per-route title in the raw HTML on every page.
const stripExistingTitle = (html) => html.replace(/<title>[^<]*<\/title>\s*/i, '')

export function pageHtml(route, template, head, bodyHtml, preload = {}) {
  return stripExistingTitle(template)
    .replace(/<html lang="[^"]*"/, `<html lang="${routeLang(route)}"`)
    .replace('</head>', `${head}\n</head>`)
    .replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`)
    .replace('</body>', `<script>window.__PRELOAD__=${safeJson(preload)}</script>\n</body>`)
}

// D4: the admin bundle is lazily loaded and never prerendered per-route
// (App.jsx: /admin/* is a sibling of the public layout route), so it needs
// its own served file, with its own fixed title ("Admin | Philippe Gronon"),
// so a static host's SPA fallback never hands out a public route's
// prerendered <head> (title/canonical/OG for some article) to /admin.
// Controller correction 3: noindex here, on top of robots.txt's Disallow,
// since a Disallow alone doesn't guarantee a linked-to page stays unindexed.
export function adminPageHtml(template) {
  return stripExistingTitle(template).replace('</head>', `<title>Admin | ${SITE_NAME}</title>\n<meta name="robots" content="noindex">\n</head>`)
}

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

// The public API resolves every localized field to the requested language
// (api/src/routes/public.js: resolveDoc), so a single list call can't tell us
// both an article's French and English slug/title/yearLabel. Fetching each
// category in both languages and merging by _id recovers the {fr, en} shape
// collectRoutes/headFor need, without ever reading the admin API or Mongo
// directly (controller correction 3): every one of these calls hits the same
// published-only public endpoints the site itself uses.
//
// Fix round 1: this used to also zero out `slug.en` whenever it resolved to
// the same string as `slug.fr`, on the theory that an identical slug meant
// "no translation exists" (the API falls back to French when English is
// empty, so it can't tell the two cases apart). That was wrong: on this
// site, an identical fr/en slug is the *normal* case for content the client
// said doesn't need translating (e.g. exhibition titles), not a signal of a
// missing page. It silently dropped 28 real, published English routes (all
// 25 exhibitions, plus 3 works) from the site and the sitemap. There is
// nothing to infer here: fr and en are always fetched and kept exactly as
// the API returns them, so /oeuvres/x and /en/works/x are always both
// emitted, matching the running site's own EN toggle, which shows the same
// French text under lang="en" whenever no translation exists.
export function mergeArticleLists(frItems, enItems) {
  const merged = new Map()
  const put = (item, lang) => {
    const id = String(item._id)
    const entry = merged.get(id) || {
      _id: id,
      category: item.category,
      cover: item.cover,
      slug: { fr: '', en: '' },
      title: { fr: '', en: '' },
      yearLabel: { fr: '', en: '' },
    }
    entry.slug[lang] = item.slug
    entry.title[lang] = item.title
    entry.yearLabel[lang] = item.yearLabel
    merged.set(id, entry)
  }
  frItems.forEach((item) => put(item, 'fr'))
  enItems.forEach((item) => put(item, 'en'))
  return [...merged.values()]
}

async function fetchArticles() {
  const merged = []
  for (const category of CATEGORIES) {
    const [fr, en] = await Promise.all([
      fetchJson(`/articles?category=${category}&lang=fr`),
      fetchJson(`/articles?category=${category}&lang=en`),
    ])
    merged.push(...mergeArticleLists(fr.items, en.items))
  }

  // seoDescription isn't in the list projection (LIST_FIELDS in
  // api/src/routes/public.js), only on the single-article endpoint, so it
  // takes one more published-only request per article, per language.
  await Promise.all(
    merged.map(async (a) => {
      const slug = a.slug.fr || a.slug.en
      const [fr, en] = await Promise.all([
        fetchJson(`/articles/${slug}?lang=fr`).catch(() => null),
        fetchJson(`/articles/${slug}?lang=en`).catch(() => null),
      ])
      a.seoDescription = { fr: fr?.seoDescription || '', en: en?.seoDescription || '' }
    })
  )

  return merged
}

// Controller correction 4: fetchJson already throws on a non-2xx response or
// a connection failure, which main() below treats as "API unreachable" and
// degrades to shipping the bare SPA shell (see the catch around
// fetchArticles/fetchPages). That path does not catch a *reachable* API that
// answers 200 with an (almost) empty list -- that would fall through this
// function entirely and quietly emit a couple dozen static-page routes with
// zero articles, exit 0, and ship a near-empty site. The real archive has 63
// articles and 142 routes; these floors sit well below either, so ordinary
// growth or shrinkage of the archive never trips them, only a catastrophic
// result does.
export function checkFloor({ articleCount, routeCount, articleFloor = 10, routeFloor = 30 }) {
  if (articleCount < articleFloor) {
    return `prerender aborted: API returned only ${articleCount} article(s) (expected on the order of dozens); refusing to ship a near-empty site`
  }
  if (routeCount < routeFloor) {
    return `prerender aborted: only ${routeCount} route(s) collected (expected on the order of a hundred); refusing to ship a near-empty site`
  }
  return null
}

// Fix round 1: decides how to react to a fetch failure against the API,
// extracted as a pure function so both branches are unit-testable without
// mocking fs/network. Fails closed by default: a CI build where the API is
// briefly down, mid-rollout, or its Service isn't resolving yet must not
// silently ship a contentless SPA shell to production (the checkFloor guard
// above only fires when the API *did* respond, so it cannot catch this).
// PRERENDER_OPTIONAL is an explicit, opt-in escape hatch for local build
// verification only (Step 4 of this task's brief: proving the image builds
// with no API available at all) -- it must never be set in the production
// Dockerfile path or the deploy workflow, or this guard is defeated exactly
// where it matters most. `optIn` is whatever process.env.PRERENDER_OPTIONAL
// held at call time; any truthy string opts in, unset/'' stays fail-closed.
export function unreachableApiOutcome(apiUrl, err, optIn) {
  if (optIn) {
    return { exitCode: 0, level: 'warn', message: `prerender skipped, API unreachable at ${apiUrl}: ${err.message}` }
  }
  return { exitCode: 1, level: 'error', message: `prerender aborted: API unreachable at ${apiUrl}: ${err.message}. Set PRERENDER_OPTIONAL=1 to allow a no-API local build.` }
}

async function fetchPages() {
  const pages = {}
  await Promise.all(
    CONTENT_PAGE_KEYS.map(async (key) => {
      const [fr, en] = await Promise.all([fetchJson(`/pages/${key}?lang=fr`), fetchJson(`/pages/${key}?lang=en`)])
      pages[key] = {
        title: { fr: fr.title, en: en.title },
        seoDescription: { fr: fr.seoDescription, en: en.seoDescription },
      }
    })
  )
  return pages
}

async function main() {
  const template = await readFile(join(DIST, 'index.html'), 'utf8')

  let content
  try {
    const [articles, pages] = await Promise.all([fetchArticles(), fetchPages()])
    content = { articles, pages }
  } catch (err) {
    const outcome = unreachableApiOutcome(API, err, process.env.PRERENDER_OPTIONAL)
    console[outcome.level](outcome.message)
    process.exitCode = outcome.exitCode
    return
  }

  const routes = collectRoutes({ articles: content.articles, pageKeys: PAGE_KEYS })

  const floorFailure = checkFloor({ articleCount: content.articles.length, routeCount: routes.length })
  if (floorFailure) {
    console.error(floorFailure)
    process.exitCode = 1
    return
  }

  // A computed specifier, not a string literal: this file is also loaded
  // under Vite (by vitest, to unit-test collectRoutes/headFor/pageHtml), and
  // Vite's import-analysis statically resolves literal dynamic-import
  // specifiers at transform time, which fails before dist-server/ exists
  // (it's a build artifact from `npm run build:ssr`). A computed specifier
  // resolves only when main() actually runs, under plain Node.
  const entryServerUrl = new URL('../dist-server/entry-server.js', import.meta.url)
  const { render } = await import(entryServerUrl.href)

  for (const route of routes) {
    const preload = preloadFor(route, content)
    const { html } = render(route, preload)
    const page = pageHtml(route, template, headFor(route, content, SITE), html, preload)
    const out = join(DIST, route === '/' ? 'index.html' : `${route.replace(/^\//, '')}/index.html`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, page)
  }

  const adminPage = adminPageHtml(template)
  await mkdir(join(DIST, 'admin'), { recursive: true })
  await writeFile(join(DIST, 'admin', 'index.html'), adminPage)

  // Sitemap/robots cover public routes only: no /admin, no 404, no draft
  // article (drafts never reach `routes` at all, since fetchArticles only
  // ever calls the public API's published-only endpoints).
  const urls = routes.map((r) => `  <url><loc>${SITE}${r}</loc></url>`).join('\n')
  await writeFile(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${SITE}/sitemap.xml\n`)
  console.log(`prerendered ${routes.length} routes`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
