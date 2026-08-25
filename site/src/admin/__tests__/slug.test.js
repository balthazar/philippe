import { describe, it, expect } from 'vitest'
import { slugify, slugWarning, shortenSlug, MAX_SLUG_LENGTH } from '../slug.js'

describe('slugify', () => {
  // This copy exists only to predict what the API will store. If the two ever
  // disagree, the editor shows one slug and the site serves another.
  it('matches the API: accents folded, ligatures expanded, words hyphenated', () => {
    expect(slugify("Complément d'Objet Direct")).toBe('complement-d-objet-direct')
    expect(slugify('Œuvres / Été 2023')).toBe('oeuvres-ete-2023')
    expect(slugify('  --Porte-Abri--  ')).toBe('porte-abri')
  })

  it('survives a title made only of punctuation', () => {
    expect(slugify('///')).toBe('')
    expect(slugify(null)).toBe('')
  })
})

describe('slugWarning', () => {
  // Empty is the normal state: an empty French slug is what makes the API
  // derive one, and an empty English slug means "fall back to French".
  it('says nothing about an empty or already-clean slug', () => {
    expect(slugWarning('')).toBeNull()
    expect(slugWarning(null)).toBeNull()
    expect(slugWarning('porte-abri')).toBeNull()
  })

  it('flags a capital and offers the lowercase form', () => {
    const warning = slugWarning('lumieres-d-italie-galerie-aveline-Paris')
    expect(warning.message).toMatch(/Minuscules/)
    expect(warning.suggestions).toEqual(['lumieres-d-italie-galerie-aveline-paris'])
  })

  it('flags a slash, which would read as a path segment rather than a slug', () => {
    expect(slugWarning('oeuvres/porte-abri').suggestions).toEqual(['oeuvres-porte-abri'])
  })

  // The API rejects these outright (400), and the editor only shows a
  // generic save error -- so this is the one place the artist can find out.
  it('flags a slug that would shadow a section of the site', () => {
    expect(slugWarning('contact').message).toMatch(/section du site/)
    expect(slugWarning('biographie').message).toMatch(/section du site/)
    expect(slugWarning('en').message).toMatch(/section du site/)
  })

  it('offers no suggestion when nothing usable is left', () => {
    const warning = slugWarning('///')
    expect(warning.message).toMatch(/aucune lettre ni chiffre/)
    expect(warning.suggestions).toEqual([])
  })

  it('flags an over-long slug and proposes shorter ones', () => {
    const long = 'cycle-l-eternel-detour-sequence-printemps-2013-partage-de-minuit-une-exposition-dans-la-collection-mamco-geneve'
    const warning = slugWarning(long)
    expect(warning.message).toMatch(new RegExp(`${long.length} caractères`))
    expect(warning.suggestions.length).toBeGreaterThan(0)
    warning.suggestions.forEach((s) => expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH))
  })

  // Length is checked last: a slug that is both long AND malformed has a
  // shape problem first, and fixing the shape may fix the length too.
  it('reports shape before length', () => {
    expect(slugWarning(`Trop-Long-${'a'.repeat(80)}`).message).toMatch(/Minuscules/)
  })
})

describe('shortenSlug', () => {
  const long = 'complement-d-objet-direct-proposition-de-philippe-gronon-et-d-eric-schmitt-galerie-dutko-paris'

  it('proposes only slugs that actually fit', () => {
    shortenSlug(long).forEach((s) => expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH))
  })

  it('proposes whole words, never a word cut in half', () => {
    shortenSlug(long).forEach((s) => expect(long.split('-')).toEqual(expect.arrayContaining(s.split('-'))))
  })

  // "...-philippe-gronon-et" reads as an interrupted sentence rather than a
  // shortened one.
  it('never ends a proposal on a stopword', () => {
    shortenSlug(long).forEach((s) => expect(s.endsWith('-et')).toBe(false))
  })

  it('returns nothing for a slug that is already short enough', () => {
    expect(shortenSlug('porte-abri')).toEqual([])
  })

  // One unbroken word can't be shortened without cutting it, and a truncated
  // word is a worse address than a long one.
  it('returns nothing when there are no words to drop', () => {
    expect(shortenSlug('a'.repeat(90))).toEqual([])
  })
})
