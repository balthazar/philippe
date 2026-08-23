import { describe, it, expect } from 'vitest'
import { routeFor, langFromPath } from '../routes.js'

describe('routeFor', () => {
  it('builds French section paths without a prefix', () => {
    expect(routeFor('works', 'fr')).toBe('/oeuvres')
    expect(routeFor('biography', 'fr')).toBe('/biographie')
  })

  it('builds English section paths under /en', () => {
    expect(routeFor('works', 'en')).toBe('/en/works')
    expect(routeFor('home', 'en')).toBe('/en')
  })

  // Task 27, Part A (SEO-critical URL restructure): individual articles move
  // to the root -- /:slug in French, /en/:slug in English -- to match the
  // URLs the site being replaced used. Only section listings (works,
  // biography, ...) keep their segment; the section `key` passed alongside a
  // slug no longer affects the article's own URL at all.
  it('builds a French article path at the root, with no section segment', () => {
    expect(routeFor('works', 'fr', 'chassis-presse')).toBe('/chassis-presse')
    expect(routeFor('exhibitions', 'fr', 'retrospective')).toBe('/retrospective')
  })

  it('builds an English article path under /en, with no section segment', () => {
    expect(routeFor('works', 'en', 'press-frame')).toBe('/en/press-frame')
    expect(routeFor('exhibitions', 'en', 'retrospective')).toBe('/en/retrospective')
  })

  // Client feedback (task 25): slug is the one localized field that didn't
  // already follow the `en || fr` rule every other field on this project
  // uses. A blank English slug used to produce `/en/works` -- the section
  // listing, not an article page.
  it('falls back to the French slug when given the raw {fr, en} field and English is blank', () => {
    expect(routeFor('works', 'en', { fr: 'chassis-presse', en: '' })).toBe('/en/chassis-presse')
  })

  it('still prefers the English slug when the raw field has one', () => {
    expect(routeFor('works', 'en', { fr: 'chassis-presse', en: 'press-frame' })).toBe('/en/press-frame')
  })

  it('uses the French slug as-is on the French route, from the raw field', () => {
    expect(routeFor('works', 'fr', { fr: 'chassis-presse', en: '' })).toBe('/chassis-presse')
  })
})

describe('langFromPath', () => {
  it('detects English from the /en prefix and defaults to French', () => {
    expect(langFromPath('/en/works')).toBe('en')
    expect(langFromPath('/oeuvres')).toBe('fr')
    expect(langFromPath('/')).toBe('fr')
    expect(langFromPath('/entrepot')).toBe('fr') // not the /en prefix
  })
})
