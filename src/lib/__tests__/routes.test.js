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
})

describe('langFromPath', () => {
  it('detects English from the /en prefix and defaults to French', () => {
    expect(langFromPath('/en/works')).toBe('en')
    expect(langFromPath('/oeuvres')).toBe('fr')
    expect(langFromPath('/')).toBe('fr')
    expect(langFromPath('/entrepot')).toBe('fr') // not the /en prefix
  })
})
