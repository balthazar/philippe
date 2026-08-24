import { describe, it, expect } from 'vitest'
import {
  collectRoutes, headFor, pageHtml, adminPageHtml, mergeArticleLists, preloadFor, checkFloor, unreachableApiOutcome,
} from '../index.js'

// Controller correction 4: a reachable API answering 200 with an (almost)
// empty list is not caught by main()'s try/catch around fetchArticles /
// fetchPages (nothing throws), so without this floor it would silently emit
// a handful of static-page routes, exit 0, and ship a near-empty site.
describe('checkFloor', () => {
  it('flags zero articles even when static-page routes exist', () => {
    const failure = checkFloor({ articleCount: 0, routeCount: 18 })
    expect(failure).toMatch(/0 article/)
  })

  it('flags an implausibly small route count even with some articles', () => {
    const failure = checkFloor({ articleCount: 12, routeCount: 20 })
    expect(failure).toMatch(/20 route/)
  })

  it('passes on counts near the real archive size', () => {
    expect(checkFloor({ articleCount: 63, routeCount: 142 })).toBeNull()
  })

  it('does not trip on ordinary growth or shrinkage of the archive', () => {
    expect(checkFloor({ articleCount: 40, routeCount: 90 })).toBeNull()
  })
})

// Fix round 1: the API-unreachable path used to always skip and exit 0 (a
// missing API "must not break the deploy"), which is exactly backwards for
// a CI deploy where the API is briefly down, mid-rollout, or its Service
// isn't resolving yet -- that build would go green and ship a contentless
// SPA shell to production with nobody the wiser. Pins both branches: fails
// closed by default, and only skips when PRERENDER_OPTIONAL is explicitly
// set (the local, no-API build-verification case from this task's Step 4).
describe('unreachableApiOutcome', () => {
  it('fails closed by default: no PRERENDER_OPTIONAL means a non-zero exit', () => {
    const outcome = unreachableApiOutcome('http://unreachable/api', new Error('fetch failed'), undefined)
    expect(outcome.exitCode).toBe(1)
    expect(outcome.message).toMatch(/aborted/)
    expect(outcome.message).toContain('http://unreachable/api')
  })

  it('also fails closed on an explicitly falsy opt-in (empty string)', () => {
    const outcome = unreachableApiOutcome('http://unreachable/api', new Error('fetch failed'), '')
    expect(outcome.exitCode).toBe(1)
  })

  it('skips and exits 0 only when PRERENDER_OPTIONAL is explicitly set', () => {
    const outcome = unreachableApiOutcome('http://unreachable/api', new Error('fetch failed'), '1')
    expect(outcome.exitCode).toBe(0)
    expect(outcome.message).toMatch(/skipped/)
    expect(outcome.message).toContain('http://unreachable/api')
  })
})

// Task 27, Part A (SEO-critical): individual articles move to the root,
// matching the URLs the site being replaced used
// (https://www.philippegronon.com/<slug>/). Only section listings
// (works, exhibitions, ...) keep their own segment.
describe('collectRoutes', () => {
  it('emits both languages for every static page, and articles at the root', () => {
    const routes = collectRoutes({
      articles: [{ category: 'works', slug: { fr: 'porte', en: 'door' } }],
      pageKeys: ['biography'],
    })
    expect(routes).toContain('/')
    expect(routes).toContain('/en')
    expect(routes).toContain('/porte')
    expect(routes).toContain('/en/door')
    expect(routes).toContain('/biographie')
    expect(routes).toContain('/en/biography')
  })

  it('puts an exhibition at the root too, in the same flat namespace as a work', () => {
    const routes = collectRoutes({
      articles: [{ category: 'exhibitions', slug: { fr: 'retrospective', en: 'retrospective-en' } }],
      pageKeys: [],
    })
    expect(routes).toContain('/retrospective')
    expect(routes).toContain('/en/retrospective-en')
  })

  // Client feedback (task 25): reversed from the prior behaviour, which
  // skipped the English route entirely when the English slug was blank.
  // Slug is a localized field like any other and should follow the same
  // `en || fr` fallback the rest of the content model uses -- a blank
  // English slug must still get an English page, built from the French
  // slug, not silently disappear from the site and its sitemap.
  it('builds the English article route from the French slug when the English slug is blank', () => {
    const routes = collectRoutes({ articles: [{ category: 'works', slug: { fr: 'nouveau-2024', en: '' } }], pageKeys: [] })
    expect(routes).toContain('/nouveau-2024')
    expect(routes).toContain('/en/nouveau-2024')
  })

  // Fix round 1: a real, live-data bug. "Identical fr/en slug" was being
  // read as "no English translation exists" and silently dropped the
  // English route for 28 published articles (all 25 exhibitions, plus 3
  // works) -- the client explicitly said some titles (exhibition years,
  // proper names like "Martyrs") don't need translating, so an identical
  // slug in both languages is the *normal* case here, not a missing-page
  // signal. Both routes must exist regardless of whether the slug strings
  // happen to match.
  it('emits both routes for an article whose French and English slugs are identical', () => {
    const routes = collectRoutes({
      articles: [{ category: 'exhibitions', slug: { fr: 'martyrs-2015-2021', en: 'martyrs-2015-2021' } }],
      pageKeys: [],
    })
    expect(routes).toContain('/martyrs-2015-2021')
    expect(routes).toContain('/en/martyrs-2015-2021')
  })

  it('never emits an admin or not-found route', () => {
    const routes = collectRoutes({ articles: [], pageKeys: ['biography'] })
    expect(routes.some((r) => r.startsWith('/admin'))).toBe(false)
    expect(routes).not.toContain('/404')
  })

  // Task 33, section 3: the 25 legacy exhibition-year URLs (1989..2024) used
  // to be one article's own slug; splitting each year into its own
  // per-exhibition articles means none of them is slugged as the bare year
  // any more. Every distinct year among the (already split) exhibitions
  // articles gets its own listing route instead, in both languages, so the
  // static build actually has a file to serve there.
  it('emits a legacy year route, in both languages, for every distinct year among exhibitions articles', () => {
    const routes = collectRoutes({
      articles: [
        { category: 'exhibitions', slug: { fr: 'premier-lieu', en: '' }, yearStart: 2013 },
        { category: 'exhibitions', slug: { fr: 'second-lieu', en: '' }, yearStart: 2013 },
        { category: 'exhibitions', slug: { fr: 'expo-2012', en: '' }, yearStart: 2012 },
      ],
      pageKeys: [],
    })
    expect(routes).toContain('/2013')
    expect(routes).toContain('/en/2013')
    expect(routes).toContain('/2012')
    expect(routes).toContain('/en/2012')
    // Not duplicated even though two exhibitions share 2013.
    expect(routes.filter((r) => r === '/2013')).toHaveLength(1)
  })

  it('emits no year route for a category other than exhibitions', () => {
    const routes = collectRoutes({
      articles: [{ category: 'works', slug: { fr: 'porte', en: 'door' }, yearStart: 2013 }],
      pageKeys: [],
    })
    expect(routes).not.toContain('/2013')
  })
})

// Fix round 1: mergeArticleLists is where the same-slug-implies-untranslated
// heuristic used to live (it zeroed out `slug.en` whenever it equalled
// `slug.fr`). It no longer infers anything -- it keeps exactly what the
// public API returned for each language, even when the two calls happen to
// resolve to the same string (the API itself falls back fr -> en when a
// translation is missing, so an identical slug there is expected, not a
// signal to act on).
describe('mergeArticleLists', () => {
  it('keeps an identical fr/en slug rather than treating it as untranslated', () => {
    const frItems = [{ _id: 'a1', category: 'exhibitions', slug: 'martyrs-2015-2021', title: 'Martyrs', yearLabel: '2015-2021' }]
    const enItems = [{ _id: 'a1', category: 'exhibitions', slug: 'martyrs-2015-2021', title: 'Martyrs', yearLabel: '2015-2021' }]
    const [merged] = mergeArticleLists(frItems, enItems)
    expect(merged.slug).toEqual({ fr: 'martyrs-2015-2021', en: 'martyrs-2015-2021' })
  })

  it('merges distinct fr and en list entries for the same article by _id', () => {
    const frItems = [{ _id: 'a1', category: 'works', slug: 'tableaux-electriques-2007-2010', title: 'Tableaux Électriques', yearLabel: '2007-2010', cover: { variants: {} } }]
    const enItems = [{ _id: 'a1', category: 'works', slug: 'switchboards-2007-2010', title: 'Switchboards', yearLabel: '2007-2010', cover: { variants: {} } }]
    const [merged] = mergeArticleLists(frItems, enItems)
    expect(merged.slug).toEqual({ fr: 'tableaux-electriques-2007-2010', en: 'switchboards-2007-2010' })
    expect(merged.title).toEqual({ fr: 'Tableaux Électriques', en: 'Switchboards' })
  })

  // Task 33, section 3: collectRoutes/headFor need yearStart to compute the
  // legacy year routes -- not a localized field (unlike slug/title/
  // yearLabel above), so it is carried through as-is, not split per language.
  it('carries yearStart through, for the legacy year routes', () => {
    const frItems = [{ _id: 'a1', category: 'exhibitions', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 }]
    const enItems = [{ _id: 'a1', category: 'exhibitions', slug: 'premier-lieu', title: 'Premier lieu', yearStart: 2013 }]
    const [merged] = mergeArticleLists(frItems, enItems)
    expect(merged.yearStart).toBe(2013)
  })
})

describe('headFor', () => {
  const content = {
    articles: [{
      category: 'works',
      slug: { fr: 'porte', en: 'door' },
      title: { fr: 'Porte', en: '' },
      yearLabel: { fr: '2023', en: '' },
      cover: { variants: { medium: { path: '2023/abc-medium.webp' } } },
    }],
  }
  const site = 'https://example.org'

  it('titles an article page with its title and year', () => {
    expect(headFor('/porte', content, site)).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
  })

  it('falls back to the French title on the English route', () => {
    expect(headFor('/en/door', content, site)).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
  })

  // Task 27, Part A: canonical and hreflang move to the root along with the
  // route itself -- no section segment in either language.
  it('emits a canonical URL and both hreflang alternates, at the root', () => {
    const head = headFor('/porte', content, site)
    expect(head).toContain('<link rel="canonical" href="https://example.org/porte">')
    expect(head).toContain('hreflang="fr" href="https://example.org/porte"')
    expect(head).toContain('hreflang="en" href="https://example.org/en/door"')
  })

  it('emits an Open Graph image pointing at the cover', () => {
    expect(headFor('/porte', content, site)).toContain('content="https://example.org/media/2023/abc-medium.webp"')
  })

  // Client feedback (task 25): the hreflang alternate must agree with the
  // route collectRoutes actually generates for a blank English slug (built
  // from the French slug), not simply omit the alternate.
  it('falls back to the French slug for the English hreflang alternate when the English slug is blank', () => {
    const withBlankEnSlug = {
      articles: [{
        category: 'works',
        slug: { fr: 'nouveau-2024', en: '' },
        title: { fr: 'Nouveau', en: '' },
        yearLabel: { fr: '2024', en: '' },
      }],
    }
    const head = headFor('/nouveau-2024', withBlankEnSlug, site)
    expect(head).toContain('hreflang="en" href="https://example.org/en/nouveau-2024"')
  })

  it('titles a non-article route without crashing', () => {
    expect(headFor('/biographie', content, site)).toContain('<title>Philippe Gronon</title>')
  })

  // D4: the home route's title is literally "Philippe Gronon", never
  // "<home page title> | Philippe Gronon" -- every other route gets the
  // suffixed form.
  it('titles the home route as bare "Philippe Gronon", in either language', () => {
    const withHome = { articles: [], pages: { home: { title: { fr: 'Accueil', en: 'Home' }, seoDescription: { fr: '', en: '' } } } }
    expect(headFor('/', withHome, site)).toContain('<title>Philippe Gronon</title>')
    expect(headFor('/', withHome, site)).not.toContain('Accueil')
    expect(headFor('/en', withHome, site)).toContain('<title>Philippe Gronon</title>')
    expect(headFor('/en', withHome, site)).not.toContain('Home')
  })

  it('still emits the home page\'s own seoDescription, even though the title is fixed', () => {
    const withHomeDescription = {
      articles: [],
      pages: { home: { title: { fr: 'Accueil', en: '' }, seoDescription: { fr: 'Photographe.', en: '' } } },
    }
    expect(headFor('/', withHomeDescription, site)).toContain('<meta name="description" content="Photographe.">')
  })

  // Guards against the literal reference implementation's bug: it always read
  // match.title.fr regardless of which route (fr or en) was being rendered,
  // which the two tests above can't catch because their English fixture
  // fields are empty and fall back to French either way. This article has
  // real, distinct English content, so a route-blind implementation fails it.
  it('uses the English title, year and slug on the English route when both languages are filled in', () => {
    const bilingual = {
      articles: [{
        category: 'exhibitions',
        slug: { fr: 'retrospective', en: 'retrospective-en' },
        title: { fr: 'Rétrospective', en: 'Retrospective' },
        yearLabel: { fr: '2021', en: '2021' },
        cover: { variants: { medium: { path: '2021/r-medium.webp' } } },
      }],
    }
    const frHead = headFor('/retrospective', bilingual, site)
    const enHead = headFor('/en/retrospective-en', bilingual, site)
    expect(frHead).toContain('<title>Rétrospective, 2021 | Philippe Gronon</title>')
    expect(enHead).toContain('<title>Retrospective, 2021 | Philippe Gronon</title>')
  })

  it('emits a meta description from the article seoDescription, resolved per route language', () => {
    const withDescription = {
      articles: [{
        category: 'works',
        slug: { fr: 'porte', en: 'door' },
        title: { fr: 'Porte', en: 'Door' },
        yearLabel: { fr: '2023', en: '2023' },
        seoDescription: { fr: 'Une porte photographiée en 2023.', en: 'A door photographed in 2023.' },
        cover: { variants: { medium: { path: '2023/abc-medium.webp' } } },
      }],
    }
    expect(headFor('/porte', withDescription, site))
      .toContain('<meta name="description" content="Une porte photographiée en 2023.">')
    expect(headFor('/en/door', withDescription, site))
      .toContain('<meta name="description" content="A door photographed in 2023.">')
  })

  it('emits no description tag when neither the article nor the page has one', () => {
    expect(headFor('/porte', content, site)).not.toContain('name="description"')
    expect(headFor('/biographie', content, site)).not.toContain('name="description"')
  })

  // Regression found in manual QA against the real build (controller
  // correction 5): a naive `x.fr || x.en || x` fallback returns the {fr, en}
  // object itself when both languages are '' (an object is truthy), which
  // rendered as a literal "[object Object]" in nearly every prerendered
  // <meta name="description"> tag, since seoDescription is unset on most of
  // the live seed content. Both fields present but empty, not missing
  // entirely, is the case that trips this up.
  it('emits no description tag when seoDescription is present but empty in both languages', () => {
    const emptyDescription = {
      articles: [{
        category: 'works',
        slug: { fr: 'porte', en: 'door' },
        title: { fr: 'Porte', en: 'Door' },
        yearLabel: { fr: '2023', en: '2023' },
        seoDescription: { fr: '', en: '' },
        cover: { variants: { medium: { path: '2023/abc-medium.webp' } } },
      }],
      pages: { biography: { title: { fr: 'Biographie', en: 'Biography' }, seoDescription: { fr: '', en: '' } } },
    }
    expect(headFor('/porte', emptyDescription, site)).not.toContain('object Object')
    expect(headFor('/porte', emptyDescription, site)).not.toContain('name="description"')
    expect(headFor('/biographie', emptyDescription, site)).not.toContain('object Object')
    expect(headFor('/biographie', emptyDescription, site)).not.toContain('name="description"')
  })

  // Task 33, section 3: a legacy year URL is no longer one article's own
  // route -- it lists that year's exhibitions instead (see
  // ArticleDetail.jsx). headFor still needs to produce a real <title> and
  // both languages' canonical/hreflang for it, derived from the exhibitions
  // articles' own yearStart, not from a matching article (there is none).
  describe('a legacy exhibition-year route', () => {
    const withYears = {
      articles: [
        { category: 'exhibitions', slug: { fr: 'premier-lieu', en: '' }, title: { fr: 'Premier lieu', en: '' }, yearStart: 2013 },
        { category: 'exhibitions', slug: { fr: 'second-lieu', en: '' }, title: { fr: 'Second lieu', en: '' }, yearStart: 2013 },
      ],
    }

    it('titles it with the bare year', () => {
      expect(headFor('/2013', withYears, site)).toContain('<title>2013 | Philippe Gronon</title>')
    })

    it('emits a canonical URL and both hreflang alternates, at the root, for either language route', () => {
      const fr = headFor('/2013', withYears, site)
      expect(fr).toContain('<link rel="canonical" href="https://example.org/2013">')
      expect(fr).toContain('hreflang="fr" href="https://example.org/2013"')
      expect(fr).toContain('hreflang="en" href="https://example.org/en/2013"')

      const en = headFor('/en/2013', withYears, site)
      expect(en).toContain('<title>2013 | Philippe Gronon</title>')
      expect(en).toContain('<link rel="canonical" href="https://example.org/en/2013">')
    })

    it('does not crash and falls back to the generic title for a year with no matching exhibitions article', () => {
      expect(headFor('/1500', withYears, site)).toContain('<title>Philippe Gronon</title>')
    })
  })

  it('titles and describes a static page from content.pages, per route language', () => {
    const withPages = {
      articles: [],
      pages: {
        biography: {
          title: { fr: 'Biographie', en: 'Biography' },
          seoDescription: { fr: 'Le parcours du photographe.', en: "The photographer's career." },
        },
      },
    }
    const fr = headFor('/biographie', withPages, site)
    const en = headFor('/en/biography', withPages, site)
    expect(fr).toContain('<title>Biographie | Philippe Gronon</title>')
    expect(fr).toContain('<meta name="description" content="Le parcours du photographe.">')
    expect(en).toContain('<title>Biography | Philippe Gronon</title>')
    expect(en).toContain(`<meta name="description" content="The photographer's career.">`)
  })
})

// Fix round 1: preloadFor computes the article-page language-toggle href at
// build time, from the same merged article data headFor uses, so it can be
// rendered correctly server-side instead of only being correct after a
// client effect runs post-hydration.
//
// Task 27, Part A: the key used to be namespaced by section
// (`translatedPath:<section>:<slug>:<lang>`), since the URL itself carried
// the section. Articles now live at the root in one flat slug namespace
// shared by every category, so this keys on the slug alone -- the section is
// neither known from the route nor needed to look this up any more.
describe('preloadFor', () => {
  const content = {
    articles: [{
      category: 'works',
      slug: { fr: 'tableaux-electriques-2007-2010', en: 'switchboards-2007-2010' },
      title: { fr: 'Tableaux Électriques', en: 'Switchboards' },
    }],
  }

  it('preloads the French route with a key-value pair pointing at the English counterpart', () => {
    const preload = preloadFor('/tableaux-electriques-2007-2010', content)
    expect(preload).toEqual({
      'translatedPath:tableaux-electriques-2007-2010:fr': '/en/switchboards-2007-2010',
    })
  })

  it('preloads the English route pointing back at the French counterpart', () => {
    const preload = preloadFor('/en/switchboards-2007-2010', content)
    expect(preload).toEqual({
      'translatedPath:switchboards-2007-2010:en': '/tableaux-electriques-2007-2010',
    })
  })

  // The identical-slug case (Fix round 1): the counterpart still resolves,
  // it's just the same string under the other language prefix.
  it('preloads a same-slug article to its own slug under the other language prefix', () => {
    const sameSlug = { articles: [{ category: 'exhibitions', slug: { fr: 'martyrs-2015-2021', en: 'martyrs-2015-2021' } }] }
    expect(preloadFor('/martyrs-2015-2021', sameSlug)).toEqual({
      'translatedPath:martyrs-2015-2021:fr': '/en/martyrs-2015-2021',
    })
  })

  it('returns an empty object for a non-article route', () => {
    expect(preloadFor('/biographie', content)).toEqual({})
  })
})

// D4: the admin bundle isn't prerendered per-route, so it needs its own
// fixed title, set directly in the HTML file that's served for /admin.
describe('adminPageHtml', () => {
  const TEMPLATE = '<!doctype html><html lang="fr"><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>'

  it('sets the admin title', () => {
    expect(adminPageHtml(TEMPLATE)).toContain('<title>Admin | Philippe Gronon</title>')
  })

  it('still carries the noindex meta tag', () => {
    expect(adminPageHtml(TEMPLATE)).toContain('<meta name="robots" content="noindex">')
  })

  it('does not touch the rest of the template', () => {
    expect(adminPageHtml(TEMPLATE)).toContain('<div id="root"></div>')
  })
})

// Controller correction 2: every prerendered file must carry the correct
// <html lang>, and the earlier bug on this project was a test that could not
// tell the attribute being set from it being merely present already. This
// template uses a neutral placeholder ("xx") that is neither "fr" nor "en",
// so a passing assertion here proves pageHtml actively set the value.
describe('pageHtml', () => {
  const TEMPLATE = '<!doctype html><html lang="xx"><head></head><body><div id="root"></div></body></html>'

  it('sets lang="fr" for a French route', () => {
    const out = pageHtml('/oeuvres/porte', TEMPLATE, '<title>x</title>', '<p>hi</p>')
    expect(out).toContain('<html lang="fr">')
    expect(out).not.toContain('lang="xx"')
    expect(out).not.toContain('lang="en"')
  })

  it('sets lang="en" for an English route', () => {
    const out = pageHtml('/en/works/door', TEMPLATE, '<title>x</title>', '<p>hi</p>')
    expect(out).toContain('<html lang="en">')
    expect(out).not.toContain('lang="xx"')
    expect(out).not.toContain('lang="fr"')
  })

  it('sets lang="fr" for the root route and lang="en" for the bare /en route', () => {
    expect(pageHtml('/', TEMPLATE, '', '')).toContain('<html lang="fr">')
    expect(pageHtml('/en', TEMPLATE, '', '')).toContain('<html lang="en">')
  })

  it('injects the head tags before </head> and the body markup into #root', () => {
    const out = pageHtml('/biographie', TEMPLATE, '<meta name="test" content="1">', '<main>content</main>')
    expect(out).toContain('<meta name="test" content="1">\n</head>')
    expect(out).toContain('<div id="root"><main>content</main></div>')
  })

  // Fix round 1: the client (main.jsx) reads window.__PRELOAD__ to seed the
  // same data the server used, so its first render matches the server's
  // exactly -- without this, preloadFor's translatedPath fix would trade a
  // stale-until-hydration link for an outright hydration mismatch instead.
  it('embeds the preload data as window.__PRELOAD__ before </body>', () => {
    const out = pageHtml('/oeuvres/porte', TEMPLATE, '', '', { 'translatedPath:works:porte:fr': '/en/works/door' })
    expect(out).toContain('<script>window.__PRELOAD__={"translatedPath:works:porte:fr":"/en/works/door"}</script>')
  })

  it('embeds an empty preload object when none is given', () => {
    const out = pageHtml('/biographie', TEMPLATE, '', '')
    expect(out).toContain('<script>window.__PRELOAD__={}</script>')
  })

  it('escapes "<" in preloaded values so they cannot close the script tag early', () => {
    const out = pageHtml('/oeuvres/porte', TEMPLATE, '', '', { evil: '</script><script>alert(1)' })
    expect(out).not.toContain('</script><script>alert(1)')
    // Escaping the leading "<" is enough: "</script>" cannot start without
    // it, even though ">" itself is left alone.
    expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)')
  })

  // Coordinator feedback: index.html now carries its own default <title>
  // (so there is a sensible value before React mounts, and on a build that
  // skips the prerender). Without stripping it first, the route-specific
  // <title> in `head` would be a SECOND <title> tag appended later in
  // <head> -- and per the DOM/HTML spec, `document.title` (and what a
  // crawler that doesn't execute JS indexes) reads the FIRST <title> in the
  // document, not the last. That would silently un-fix every per-route
  // title this project prerenders, since the generic default would always
  // win over the real one in the raw HTML.
  it('replaces an existing <title> in the template rather than adding a second one', () => {
    const templateWithTitle = '<!doctype html><html lang="xx"><head><title>Philippe Gronon</title></head><body><div id="root"></div></body></html>'
    const out = pageHtml('/oeuvres/porte', templateWithTitle, '<title>Porte, 2023 | Philippe Gronon</title>', '<p>hi</p>')
    expect(out.match(/<title>/g)).toHaveLength(1)
    expect(out).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
    expect(out).not.toContain('<title>Philippe Gronon</title>')
  })
})
