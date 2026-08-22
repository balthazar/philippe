import { describe, it, expect } from 'vitest'
import { pairByTrid, mapCategory, parseYearLabel, assertRowCount } from '../extract.js'

describe('mapCategory', () => {
  it('maps both language names onto one canonical category', () => {
    expect(mapCategory('Œuvres')).toBe('works')
    expect(mapCategory('Works')).toBe('works')
    expect(mapCategory('Expositions')).toBe('exhibitions')
    expect(mapCategory('Éditions')).toBe('editions')
    expect(mapCategory('Editions')).toBe('editions')
    expect(mapCategory('Commandes publiques')).toBe('public-orders')
    expect(mapCategory('Public Orders')).toBe('public-orders')
  })

  it('throws on an unmapped category rather than guessing', () => {
    expect(() => mapCategory('Sculpture')).toThrow(/unmapped category/i)
  })
})

describe('parseYearLabel', () => {
  it('splits a trailing year off the title', () => {
    expect(parseYearLabel('Nouveau | 2024')).toEqual({ title: 'Nouveau', yearLabel: '2024', yearStart: 2024, yearEnd: 2024 })
  })

  it('handles a date range', () => {
    expect(parseYearLabel('Châssis-Presse | 2018-2021')).toEqual({
      title: 'Châssis-Presse', yearLabel: '2018-2021', yearStart: 2018, yearEnd: 2021,
    })
  })

  it('leaves a title with no trailing year alone', () => {
    expect(parseYearLabel('Biographie')).toEqual({ title: 'Biographie', yearLabel: '', yearStart: null, yearEnd: null })
  })

  it('does not treat a pipe inside a title as a year separator', () => {
    expect(parseYearLabel('Ampli | Boogie')).toEqual({ title: 'Ampli | Boogie', yearLabel: '', yearStart: null, yearEnd: null })
  })
})

describe('pairByTrid', () => {
  it('pairs French and English rows into one record', () => {
    const rows = [
      { ID: 1, trid: 10, language_code: 'fr', post_title: 'Porte | 2023', post_name: 'porte' },
      { ID: 2, trid: 10, language_code: 'en', post_title: 'Door | 2023', post_name: 'door' },
    ]
    const [pair] = pairByTrid(rows)
    expect(pair.fr.ID).toBe(1)
    expect(pair.en.ID).toBe(2)
  })

  it('uses the English row as the base when no French row exists', () => {
    const rows = [{ ID: 9, trid: 11, language_code: 'en', post_title: 'Nouveau | 2024', post_name: 'nouveau-2024' }]
    const [only] = pairByTrid(rows)
    expect(only.fr.ID).toBe(9)
    expect(only.enOnly).toBe(true)
  })

  it('throws on a duplicate (trid, language) pair', () => {
    const rows = [
      { ID: 1, trid: 10, language_code: 'fr', post_title: 'Porte | 2023', post_name: 'porte' },
      { ID: 2, trid: 10, language_code: 'fr', post_title: 'Porte bis | 2023', post_name: 'porte-bis' },
    ]
    expect(() => pairByTrid(rows)).toThrow(/duplicate fr row for trid 10/i)
  })
})

describe('assertRowCount', () => {
  it('throws when the joined count is short', () => {
    expect(() => assertRowCount(124, 125, 'published posts')).toThrow(/lost rows/i)
  })

  it('does not throw when the joined count matches', () => {
    expect(() => assertRowCount(125, 125, 'published posts')).not.toThrow()
  })
})
