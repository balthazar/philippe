import { describe, it, expect } from 'vitest'
import {
  pairByTrid, mapCategory, parseYearLabel, assertRowCount, extractSubtitle, purgeImageBlocks,
  reduceContactPageBlocks, removeEmptyTextBlocks, removeSubtitleDuplicateBlocks, ensureCoverInGallery,
} from '../extract.js'

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

  // Client feedback (task 27): the previous version only ever looked at the
  // FIRST text block by type. On real archive articles (client-measured: 30
  // of 34 works) the technique line is genuinely the first text block and
  // this worked; but a works article whose first text block is real prose
  // (ending in terminal punctuation) with the technique line further down
  // used to fall through to "no match" without ever looking past that first
  // block -- the true technique line was left both un-extracted AND, since
  // extraction never touched it, still sitting in the article as a block.
  it('finds and removes the technique line even when an earlier text block is real prose', () => {
    const blocks = [
      textBlock('<p>Une véritable description en prose qui se termine par un point.</p>'),
      { type: 'heading', value: { fr: 'x', en: '' }, level: 2 },
      textBlock('<p>Numérisation, épreuves numériques pigmentaires</p>'),
      { type: 'gallery', items: [] },
    ]
    const result = extractSubtitle('works', blocks)
    expect(result.matched).toBe(true)
    expect(result.subtitle).toEqual({ fr: 'Numérisation, épreuves numériques pigmentaires', en: '' })
    expect(result.blocks).toEqual([blocks[0], blocks[1], blocks[3]])
  })
})

// Client feedback (task 27): the technique line the migration lifts into
// `subtitle` sometimes appears a SECOND time in the source content, as its
// own separate text block elsewhere in the article (measured: 30 of 63
// articles). extractSubtitle only ever removes the ONE occurrence it matched
// on; this is a second, content-based pass over what's left, run after
// subtitle extraction, that drops any other text block whose entire content
// is exactly `<p>{subtitle}</p>` -- matched on content, not position, since
// position is what left these duplicates behind in the first place.
describe('removeSubtitleDuplicateBlocks', () => {
  const textBlock = (fr, en = '') => ({ type: 'text', value: { fr, en } })

  it('removes a later text block that exactly duplicates the extracted subtitle', () => {
    const blocks = [
      textBlock('<p>Une prose qui reste.</p>'),
      textBlock('<p>1. Légende unique - 2023</p>'),
      textBlock(''),
      textBlock('<p>Photographie analogique, épreuve numérique pigmentaire</p>'),
      { type: 'gallery', items: [] },
    ]
    const subtitle = { fr: 'Photographie analogique, épreuve numérique pigmentaire', en: '' }
    expect(removeSubtitleDuplicateBlocks(blocks, subtitle)).toEqual([blocks[0], blocks[1], blocks[2], blocks[4]])
  })

  it('leaves a block whose content only partially overlaps the subtitle untouched', () => {
    const blocks = [textBlock('<p>1. Photographie analogique, épreuve numérique pigmentaire - 2023</p>')]
    const subtitle = { fr: 'Photographie analogique, épreuve numérique pigmentaire', en: '' }
    expect(removeSubtitleDuplicateBlocks(blocks, subtitle)).toEqual(blocks)
  })

  it('does nothing when there is no subtitle to match against', () => {
    const blocks = [textBlock('<p>x</p>')]
    expect(removeSubtitleDuplicateBlocks(blocks, { fr: '', en: '' })).toEqual(blocks)
  })

  // Coordinator feedback: a real archive miss (tableaux-chrysler-building-
  // new-york-2004). The duplicate block had a <br /> where the extracted
  // subtitle has a plain space -- `<p>...argentiques<br />Cibachrome...</p>`
  // vs "...argentiques Cibachrome...". Exact-string comparison never
  // matched, so the duplicate survived. Tags must be stripped TO
  // whitespace (not to nothing), runs of whitespace collapsed to one
  // space, and both sides trimmed, before comparing.
  it('normalizes a <br /> inside the duplicate block to whitespace before comparing', () => {
    const blocks = [
      textBlock('<p>Photographies couleur, tirages argentiques<br />Cibachrome montés sous Diasec</p>'),
    ]
    const subtitle = { fr: 'Photographies couleur, tirages argentiques Cibachrome montés sous Diasec', en: '' }
    expect(removeSubtitleDuplicateBlocks(blocks, subtitle)).toEqual([])
  })
})

// Client feedback (task 27): 26 articles carry a text block whose fr and en
// are both empty -- rendering nothing on the page, showing as a blank field
// in the editor. "Empty" is judged after stripping tags and whitespace (an
// empty `<p></p>` counts; a block with real text does not), and only ever
// applies to `text` blocks -- an image block with no image yet is the
// artist's business, not the migration's.
describe('removeEmptyTextBlocks', () => {
  it('drops a text block whose fr and en are both empty after stripping tags and whitespace', () => {
    const blocks = [
      { type: 'text', value: { fr: '', en: '' } },
      { type: 'text', value: { fr: '<p></p>', en: '  ' } },
      { type: 'text', value: { fr: '<p>Reste</p>', en: '' } },
    ]
    expect(removeEmptyTextBlocks(blocks)).toEqual([blocks[2]])
  })

  it('never removes a non-text block on emptiness grounds', () => {
    const blocks = [{ type: 'image', image: null }]
    expect(removeEmptyTextBlocks(blocks)).toEqual(blocks)
  })
})

// Client feedback (task 27), replacing the original B3 plan: 37 of 63
// articles have a cover that is not among their gallery images, and one has
// no gallery at all. Rather than keep a separate cover picker forever, the
// migration folds each such cover into the article's own gallery as a
// hidden item (creating the gallery when none exists) so the admin's two
// per-image toggles ("Cover", "Hidden from grid") can express every case,
// no visible grid image is added, and no cover is lost.
describe('ensureCoverInGallery', () => {
  it('adds the cover to an existing gallery block as a hidden item when not already present', () => {
    const blocks = [{ type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 1 } }] }]
    const result = ensureCoverInGallery({ coverLegacyId: 2, blocks })
    expect(result[0].items).toEqual([
      { image: { legacyWpId: 1 } },
      { image: { legacyWpId: 2 }, caption: { fr: '', en: '' }, span: 1, hidden: true },
    ])
  })

  it('creates a gallery block containing just the hidden cover when the article has no gallery at all', () => {
    const blocks = [{ type: 'text', value: { fr: 'x', en: '' } }]
    const result = ensureCoverInGallery({ coverLegacyId: 5, blocks })
    expect(result).toEqual([
      blocks[0],
      { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 5 }, caption: { fr: '', en: '' }, span: 1, hidden: true }] },
    ])
  })

  it('does nothing when the cover is already among the gallery items', () => {
    const blocks = [{ type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 9 } }] }]
    expect(ensureCoverInGallery({ coverLegacyId: 9, blocks })).toEqual(blocks)
  })

  it('does nothing when there is no cover at all', () => {
    const blocks = [{ type: 'gallery', columns: 3, items: [] }]
    expect(ensureCoverInGallery({ coverLegacyId: null, blocks })).toEqual(blocks)
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
