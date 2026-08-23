import { describe, it, expect } from 'vitest'
import { collectRoutes, headFor, pageHtml, mergeArticleLists, preloadFor } from '../index.js'

describe('collectRoutes', () => {
  it('emits both languages for every static page and article', () => {
    const routes = collectRoutes({
      articles: [{ category: 'works', slug: { fr: 'porte', en: 'door' } }],
      pageKeys: ['biography'],
    })
    expect(routes).toContain('/')
    expect(routes).toContain('/en')
    expect(routes).toContain('/oeuvres/porte')
    expect(routes).toContain('/en/works/door')
    expect(routes).toContain('/biographie')
    expect(routes).toContain('/en/biography')
  })

  it('skips the English article route when there is no English slug', () => {
    const routes = collectRoutes({ articles: [{ category: 'works', slug: { fr: 'nouveau-2024', en: '' } }], pageKeys: [] })
    expect(routes).toContain('/oeuvres/nouveau-2024')
    expect(routes.filter((r) => r.startsWith('/en/works/'))).toEqual([])
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
    expect(routes).toContain('/expositions/martyrs-2015-2021')
    expect(routes).toContain('/en/exhibitions/martyrs-2015-2021')
  })

  it('never emits an admin or not-found route', () => {
    const routes = collectRoutes({ articles: [], pageKeys: ['biography'] })
    expect(routes.some((r) => r.startsWith('/admin'))).toBe(false)
    expect(routes).not.toContain('/404')
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
    expect(headFor('/oeuvres/porte', content, site)).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
  })

  it('falls back to the French title on the English route', () => {
    expect(headFor('/en/works/door', content, site)).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
  })

  it('emits a canonical URL and both hreflang alternates', () => {
    const head = headFor('/oeuvres/porte', content, site)
    expect(head).toContain('<link rel="canonical" href="https://example.org/oeuvres/porte">')
    expect(head).toContain('hreflang="fr" href="https://example.org/oeuvres/porte"')
    expect(head).toContain('hreflang="en" href="https://example.org/en/works/door"')
  })

  it('emits an Open Graph image pointing at the cover', () => {
    expect(headFor('/oeuvres/porte', content, site)).toContain('content="https://example.org/media/2023/abc-medium.webp"')
  })

  it('titles a non-article route without crashing', () => {
    expect(headFor('/biographie', content, site)).toContain('<title>Philippe Gronon</title>')
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
    const frHead = headFor('/expositions/retrospective', bilingual, site)
    const enHead = headFor('/en/exhibitions/retrospective-en', bilingual, site)
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
    expect(headFor('/oeuvres/porte', withDescription, site))
      .toContain('<meta name="description" content="Une porte photographiée en 2023.">')
    expect(headFor('/en/works/door', withDescription, site))
      .toContain('<meta name="description" content="A door photographed in 2023.">')
  })

  it('emits no description tag when neither the article nor the page has one', () => {
    expect(headFor('/oeuvres/porte', content, site)).not.toContain('name="description"')
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
    expect(headFor('/oeuvres/porte', emptyDescription, site)).not.toContain('object Object')
    expect(headFor('/oeuvres/porte', emptyDescription, site)).not.toContain('name="description"')
    expect(headFor('/biographie', emptyDescription, site)).not.toContain('object Object')
    expect(headFor('/biographie', emptyDescription, site)).not.toContain('name="description"')
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
describe('preloadFor', () => {
  const content = {
    articles: [{
      category: 'works',
      slug: { fr: 'tableaux-electriques-2007-2010', en: 'switchboards-2007-2010' },
      title: { fr: 'Tableaux Électriques', en: 'Switchboards' },
    }],
  }

  it('preloads the French route with a key-value pair pointing at the English counterpart', () => {
    const preload = preloadFor('/oeuvres/tableaux-electriques-2007-2010', content)
    expect(preload).toEqual({
      'translatedPath:works:tableaux-electriques-2007-2010:fr': '/en/works/switchboards-2007-2010',
    })
  })

  it('preloads the English route pointing back at the French counterpart', () => {
    const preload = preloadFor('/en/works/switchboards-2007-2010', content)
    expect(preload).toEqual({
      'translatedPath:works:switchboards-2007-2010:en': '/oeuvres/tableaux-electriques-2007-2010',
    })
  })

  // The identical-slug case (Fix round 1): the counterpart still resolves,
  // it's just the same string under the other language prefix.
  it('preloads a same-slug article to its own slug under the other language prefix', () => {
    const sameSlug = { articles: [{ category: 'exhibitions', slug: { fr: 'martyrs-2015-2021', en: 'martyrs-2015-2021' } }] }
    expect(preloadFor('/expositions/martyrs-2015-2021', sameSlug)).toEqual({
      'translatedPath:exhibitions:martyrs-2015-2021:fr': '/en/exhibitions/martyrs-2015-2021',
    })
  })

  it('returns an empty object for a non-article route', () => {
    expect(preloadFor('/biographie', content)).toEqual({})
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
})
