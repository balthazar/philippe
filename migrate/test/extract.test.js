import { describe, it, expect } from 'vitest'
import { pairByTrid, mapCategory, parseYearLabel, assertRowCount, extractSubtitle, purgeImageBlocks, reduceContactPageBlocks } from '../extract.js'

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

// Task 26, part A1: every works article's first text block is the technique
// line ("Numérisation, épreuves numériques pigmentaires"), not prose. The
// rule is structural and inspectable, not a guess: it is the first <p> of
// the works article's first text block, PROVIDED that paragraph does not end
// in terminal sentence punctuation (the mark of a narrative sentence rather
// than a terse process/materials label). Anything that doesn't fit that
// shape is left alone and reported as non-matching, never silently dropped.
describe('extractSubtitle', () => {
  const textBlock = (fr, en = '') => ({ type: 'text', value: { fr, en } })

  it('only applies to works articles', () => {
    const blocks = [textBlock('<p>Photographies argentiques noir et blanc</p>')]
    const result = extractSubtitle('exhibitions', blocks)
    expect(result.matched).toBe(false)
    expect(result.subtitle).toEqual({ fr: '', en: '' })
    expect(result.blocks).toEqual(blocks)
  })

  it('moves a single-paragraph technique line into subtitle and removes the block', () => {
    const blocks = [
      { type: 'image', image: { legacyWpId: 1 } },
      { type: 'heading', value: { fr: 'x', en: '' }, level: 2 },
      textBlock('<p>Numérisation, épreuves numériques pigmentaires</p>'),
      { type: 'gallery', items: [] },
    ]
    const result = extractSubtitle('works', blocks)
    expect(result.matched).toBe(true)
    expect(result.subtitle).toEqual({ fr: 'Numérisation, épreuves numériques pigmentaires', en: '' })
    expect(result.blocks).toEqual([
      { type: 'image', image: { legacyWpId: 1 } },
      { type: 'heading', value: { fr: 'x', en: '' }, level: 2 },
      { type: 'gallery', items: [] },
    ])
  })

  it('carries an English override across when it also fits the shape', () => {
    const blocks = [textBlock('<p>Scanning, digital pigment proofs</p>', '<p>Numérisation, épreuves numériques pigmentaires</p>')]
    const result = extractSubtitle('works', blocks)
    expect(result.subtitle).toEqual({
      fr: 'Scanning, digital pigment proofs',
      en: 'Numérisation, épreuves numériques pigmentaires',
    })
  })

  it('splits a leading technique line off a block that also carries real prose, keeping the prose as a block', () => {
    const blocks = [
      textBlock(
        '<p>Photographies argentiques noir et blanc contre-collées sur aluminium</p><p>Série de trente écritoires.</p>',
        '<p>Black and white film photographs laminated on aluminum</p><p>Series of thirty writing desks.</p>'
      ),
    ]
    const result = extractSubtitle('works', blocks)
    expect(result.matched).toBe(true)
    expect(result.subtitle).toEqual({
      fr: 'Photographies argentiques noir et blanc contre-collées sur aluminium',
      en: 'Black and white film photographs laminated on aluminum',
    })
    expect(result.blocks).toEqual([
      textBlock('<p>Série de trente écritoires.</p>', '<p>Series of thirty writing desks.</p>'),
    ])
  })

  it('leaves prose alone when the first paragraph ends in terminal punctuation, and reports it as non-matching', () => {
    const blocks = [textBlock('<p>Cette œuvre a été réalisée en plusieurs étapes.</p>')]
    const result = extractSubtitle('works', blocks)
    expect(result.matched).toBe(false)
    expect(result.reason).toMatch(/prose/i)
    expect(result.blocks).toEqual(blocks)
    expect(result.subtitle).toEqual({ fr: '', en: '' })
  })

  it('reports non-matching when a works article has no text block at all', () => {
    const blocks = [{ type: 'image', image: { legacyWpId: 1 } }]
    const result = extractSubtitle('works', blocks)
    expect(result.matched).toBe(false)
    expect(result.reason).toMatch(/no text block/i)
  })
})

// Task 26, part A3: icone-oeuvres.jpg was the old theme's menu-toggle icon
// (a black circle and chevron), pure decoration, never a cover, never in a
// gallery, never on a page. Purged by legacy id, computed from the media
// list at extraction time rather than hardcoded, so a re-run against fresh
// WordPress ids still finds it.
describe('purgeImageBlocks', () => {
  it('drops an image block whose legacy id is in the purge set', () => {
    const blocks = [
      { type: 'image', image: { legacyWpId: 14136 } },
      { type: 'text', value: { fr: '<p>x</p>', en: '' } },
    ]
    expect(purgeImageBlocks(blocks, new Set([14136]))).toEqual([
      { type: 'text', value: { fr: '<p>x</p>', en: '' } },
    ])
  })

  it('leaves an image block whose legacy id is not purged untouched', () => {
    const blocks = [{ type: 'image', image: { legacyWpId: 99 } }]
    expect(purgeImageBlocks(blocks, new Set([14136]))).toEqual(blocks)
  })

  it('drops only the purged items out of a gallery, keeping the rest', () => {
    const blocks = [
      { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 14136 } }, { image: { legacyWpId: 7 } }] },
    ]
    expect(purgeImageBlocks(blocks, new Set([14136]))).toEqual([
      { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 7 } }] },
    ])
  })

  it('drops a gallery block entirely when every item in it is purged', () => {
    const blocks = [{ type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 14136 } }] }]
    expect(purgeImageBlocks(blocks, new Set([14136]))).toEqual([])
  })
})

// Task 26, part B3: /contact carries six blocks today -- the mailto, a
// "Graphisme" credit, a logo image, a text-credit line, a "site créé par"
// line and a rights line. Reduced, through the migration, to just the
// mailto. Matched on the exact sanitized HTML the mailto block renders as,
// scoped to the 'contact' source slug only, so no other page is touched.
describe('reduceContactPageBlocks', () => {
  const mailto = { type: 'text', value: { fr: '<p><a href="mailto:info@philippegronon.com">info@philippegronon.com</a></p>', en: '<p><a href="mailto:info@philippegronon.com">info@philippegronon.com</a></p>' } }
  const credit = { type: 'text', value: { fr: '<p>Graphisme   |</p>', en: '<p>Graphic design   |</p>' } }
  const logo = { type: 'image', image: { legacyWpId: 17901 }, caption: { fr: '', en: '' }, size: 'wide' }

  it('keeps only the mailto block on the contact page', () => {
    expect(reduceContactPageBlocks('contact', [mailto, credit, logo])).toEqual([mailto])
  })

  it('leaves every other page untouched', () => {
    const blocks = [mailto, credit, logo]
    expect(reduceContactPageBlocks('biographie', blocks)).toEqual(blocks)
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
