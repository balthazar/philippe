import { describe, it, expect } from 'vitest'
import { collectRoutes, headFor, pageHtml } from '../index.js'

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

  it('never emits an admin or not-found route', () => {
    const routes = collectRoutes({ articles: [], pageKeys: ['biography'] })
    expect(routes.some((r) => r.startsWith('/admin'))).toBe(false)
    expect(routes).not.toContain('/404')
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
})
