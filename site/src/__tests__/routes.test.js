import { describe, it, expect } from 'vitest'
import { routeFor, langFromPath } from '../routes.js'

describe('routeFor', () => {
  it('builds French paths without a prefix', () => {
    expect(routeFor('works', 'fr')).toBe('/oeuvres')
    expect(routeFor('works', 'fr', 'chassis-presse')).toBe('/oeuvres/chassis-presse')
    expect(routeFor('biography', 'fr')).toBe('/biographie')
  })

  it('builds English paths under /en', () => {
    expect(routeFor('works', 'en')).toBe('/en/works')
    expect(routeFor('works', 'en', 'press-frame')).toBe('/en/works/press-frame')
    expect(routeFor('home', 'en')).toBe('/en')
  })

  // Client feedback (task 25): slug is the one localized field that didn't
  // already follow the `en || fr` rule every other field on this project
  // uses. A blank English slug used to produce `/en/works` -- the section
  // listing, not an article page.
  it('falls back to the French slug when given the raw {fr, en} field and English is blank', () => {
    expect(routeFor('works', 'en', { fr: 'chassis-presse', en: '' })).toBe('/en/works/chassis-presse')
  })

  it('still prefers the English slug when the raw field has one', () => {
    expect(routeFor('works', 'en', { fr: 'chassis-presse', en: 'press-frame' })).toBe('/en/works/press-frame')
  })

  it('uses the French slug as-is on the French route, from the raw field', () => {
    expect(routeFor('works', 'fr', { fr: 'chassis-presse', en: '' })).toBe('/oeuvres/chassis-presse')
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
