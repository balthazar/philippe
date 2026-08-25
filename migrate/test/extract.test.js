import { describe, it, expect } from 'vitest'
import {
  pairByTrid, mapCategory, parseYearLabel, assertRowCount, extractSubtitle, purgeImageBlocks,
  reduceContactPageBlocks, removeEmptyTextBlocks, removeSubtitleDuplicateBlocks, ensureCoverInGallery,
  coverLegacyIdFor, moveCreditsAfterGallery, defaultGalleryMode, splitExhibitionYear,
  removeExhibitionTitleDuplicateBlocks, removeLoremIpsumBlocks, decodeEntities,
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

// Task 37, part A (client feedback): 14 real archive text blocks are
// genuine WordPress placeholder text -- the standard "Lorem ipsum dolor sit
// amet..." filler paragraph -- not content anyone wrote. Matched on the
// block's own plain text STARTING with "lorem ipsum" (case-insensitive), so
// a block that merely mentions the phrase mid-sentence is never caught, and
// a block that opens with real prose and only trails into lorem ipsum
// filler is left alone (this only ever looks at a block's own opening
// words).
describe('removeLoremIpsumBlocks', () => {
  const textBlock = (fr, en = '') => ({ type: 'text', value: { fr, en } })

  it('drops a text block whose fr starts with the standard lorem ipsum filler', () => {
    const blocks = [
      textBlock('<p>Lorem ipsum dolor sit amet, consectetuer adipiscing elit.</p>'),
      { type: 'gallery', items: [] },
    ]
    expect(removeLoremIpsumBlocks(blocks)).toEqual([blocks[1]])
  })

  it('drops the short "Lorem ipsum" placeholder too, not just the full paragraph', () => {
    const blocks = [textBlock('<p>Lorem ipsum </p>')]
    expect(removeLoremIpsumBlocks(blocks)).toEqual([])
  })

  it('matches case-insensitively', () => {
    const blocks = [textBlock('<p>LOREM IPSUM dolor sit amet.</p>')]
    expect(removeLoremIpsumBlocks(blocks)).toEqual([])
  })

  it('drops a block whose en (not fr) starts with lorem ipsum', () => {
    const blocks = [textBlock('', 'Lorem ipsum dolor sit amet.')]
    expect(removeLoremIpsumBlocks(blocks)).toEqual([])
  })

  it('leaves a block that merely mentions the phrase mid-sentence untouched', () => {
    const blocks = [textBlock('<p>Le texte utilisait un faux lorem ipsum avant la relecture.</p>')]
    expect(removeLoremIpsumBlocks(blocks)).toEqual(blocks)
  })

  it('leaves a block that opens with real prose and only trails into lorem ipsum filler untouched', () => {
    const blocks = [textBlock('<p>Photographie argentique, tirage numérique. Lorem ipsum dolor sit amet.</p>')]
    expect(removeLoremIpsumBlocks(blocks)).toEqual(blocks)
  })

  it('never removes a non-text block', () => {
    const blocks = [{ type: 'gallery', items: [] }]
    expect(removeLoremIpsumBlocks(blocks)).toEqual(blocks)
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

// Coordinator correction, task 29: every exhibition post in the live
// WordPress database carries the literal same _thumbnail_id (14693) -- a
// work's own image, "Porte-Abri-Anti-Nucleaire" -- not 25 independent real
// choices. An exhibition year is a set of installation photographs; it has
// no single representative image, so it must never get a cover at all.
// Works (and editions/public-orders, unaffected by this bug) keep their own
// real, distinct thumbnail as before.
describe('coverLegacyIdFor', () => {
  it('never assigns a cover to an exhibition article, even when a thumbnail id is present', () => {
    expect(coverLegacyIdFor('exhibitions', '14693')).toBeNull()
  })

  it('assigns the numeric thumbnail id to a works article', () => {
    expect(coverLegacyIdFor('works', '14494')).toBe(14494)
  })

  it('leaves editions/public-orders behaviour unchanged (any non-exhibitions category)', () => {
    expect(coverLegacyIdFor('editions', '15970')).toBe(15970)
    expect(coverLegacyIdFor('public-orders', '16010')).toBe(16010)
  })

  it('returns null for a works article with no thumbnail meta at all', () => {
    expect(coverLegacyIdFor('works', undefined)).toBeNull()
  })
})

// Task 30, part 4 (client feedback): every gallery in an exhibitions
// article defaults to slider display mode; every other category's
// galleries keep the schema's existing grid default untouched. Set once
// here, at extraction time -- load.js's preserveArtistFields is what then
// protects the artist's own later choice (toggled in the admin) across a
// re-run.
describe('defaultGalleryMode', () => {
  it('sets every gallery block in an exhibitions article to slider mode', () => {
    const blocks = [
      { type: 'text', value: { fr: '<h2>Titre</h2>', en: '' } },
      { type: 'gallery', columns: 3, items: [] },
    ]
    expect(defaultGalleryMode('exhibitions', blocks)).toEqual([
      blocks[0],
      { ...blocks[1], mode: 'slider' },
    ])
  })

  it('sets every gallery block when an exhibitions article has more than one', () => {
    const blocks = [
      { type: 'gallery', columns: 3, items: [] },
      { type: 'text', value: { fr: '<p>x</p>', en: '' } },
      { type: 'gallery', columns: 2, items: [] },
    ]
    const result = defaultGalleryMode('exhibitions', blocks)
    expect(result[0].mode).toBe('slider')
    expect(result[2].mode).toBe('slider')
  })

  it('leaves works/editions/public-orders galleries untouched (no mode field added)', () => {
    const blocks = [{ type: 'gallery', columns: 3, items: [] }]
    expect(defaultGalleryMode('works', blocks)).toEqual(blocks)
    expect(defaultGalleryMode('editions', blocks)).toEqual(blocks)
    expect(defaultGalleryMode('public-orders', blocks)).toEqual(blocks)
  })

  it('leaves non-gallery blocks in an exhibitions article untouched', () => {
    const blocks = [{ type: 'text', value: { fr: '<p>x</p>', en: '' } }]
    expect(defaultGalleryMode('exhibitions', blocks)).toEqual(blocks)
  })
})

// Task 29, part 3: source order is heading, credit, gallery; the wanted
// reading order is heading, gallery, credit. Fixed here, at extraction time,
// so the admin's block list and the public page can never disagree (see the
// task brief). Deliberately conservative: only a text block that
// immediately precedes a gallery AND reads as a photo credit (marked by a
// "©", the one reliable signal) moves. Everything else -- including a text
// block that merely happens to sit before a gallery -- stays put.
describe('moveCreditsAfterGallery', () => {
  const heading = { type: 'heading', value: { fr: 'Rectos / Versos', en: '' }, level: 2 }
  const credit = { type: 'text', value: { fr: '<p>© Luca Fascini 2023</p>', en: '' } }
  const gallery = { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 1 } }] }

  it('moves a credit that immediately precedes a gallery to just after it', () => {
    expect(moveCreditsAfterGallery([heading, credit, gallery])).toEqual([heading, gallery, credit])
  })

  it('leaves a non-credit text block immediately before a gallery untouched', () => {
    const prose = { type: 'text', value: { fr: '<p>Some description</p>', en: '' } }
    expect(moveCreditsAfterGallery([heading, prose, gallery])).toEqual([heading, prose, gallery])
  })

  it('leaves a credit block untouched when it is not immediately followed by a gallery', () => {
    const trailing = { type: 'text', value: { fr: '<p>© trailing, no gallery after</p>', en: '' } }
    expect(moveCreditsAfterGallery([heading, trailing])).toEqual([heading, trailing])
  })

  it('leaves a credit block untouched when another block (not a gallery) follows it', () => {
    const another = { type: 'heading', value: { fr: 'Suite', en: '' }, level: 3 }
    expect(moveCreditsAfterGallery([credit, another, gallery])).toEqual([credit, another, gallery])
  })

  it('reorders every entry independently in a multi-entry year (heading, credit, gallery x2)', () => {
    const heading2 = { type: 'heading', value: { fr: 'Second venue', en: '' }, level: 2 }
    const credit2 = { type: 'text', value: { fr: '<p>© Second Photographer</p>', en: '' } }
    const gallery2 = { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 2 } }] }
    const input = [heading, credit, gallery, heading2, credit2, gallery2]
    expect(moveCreditsAfterGallery(input)).toEqual([heading, gallery, credit, heading2, gallery2, credit2])
  })

  it('leaves a block sequence with no credit-before-gallery adjacency completely unchanged', () => {
    const blocks = [heading, gallery]
    expect(moveCreditsAfterGallery(blocks)).toEqual(blocks)
  })
})

// Task 33, section 3: a "year" exhibitions article is really N separate
// exhibitions, each delimited by its own <h2> heading (the exhibition's own
// name) inside the one WP post's blocks. Splits it into N articles, sorted
// chronologically (each carries the parent's own year as yearStart/yearEnd)
// and, within a year, in the order they already appear on the page -- the
// only ordering the source data has, and the one the client himself
// curated when writing the page.
describe('splitExhibitionYear', () => {
  const baseArticle = (overrides = {}) => ({
    legacyWpId: 17452,
    category: 'exhibitions',
    status: 'published',
    enOnly: false,
    slug: { fr: '2013', en: '2013' },
    title: { fr: '2013', en: '2013' },
    subtitle: { fr: '', en: '' },
    yearLabel: { fr: '', en: '' },
    yearStart: null,
    yearEnd: null,
    coverLegacyId: null,
    blocks: [],
    ...overrides,
  })

  it('leaves a non-exhibitions article untouched, as a single-element array', () => {
    const article = baseArticle({ category: 'works', title: { fr: 'Porte', en: '' } })
    expect(splitExhibitionYear(article)).toEqual([article])
  })

  it('leaves an exhibitions article with no <h2> at all untouched (defensive: none exist in the real archive)', () => {
    const article = baseArticle({ blocks: [{ type: 'text', value: { fr: '<p>x</p>', en: '' } }] })
    expect(splitExhibitionYear(article)).toEqual([article])
  })

  it('splits a single heading+gallery entry into one article, titled from the heading, dated by the parent year', () => {
    const article = baseArticle({
      blocks: [
        { type: 'text', value: { fr: '<h2>Musée Untel</h2>', en: '<h2>Musée Untel</h2>' } },
        { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 1 } }] },
      ],
    })
    const result = splitExhibitionYear(article)
    expect(result).toHaveLength(1)
    expect(result[0].title).toEqual({ fr: 'Musée Untel', en: 'Musée Untel' })
    expect(result[0].yearStart).toBe(2013)
    expect(result[0].yearEnd).toBe(2013)
    // splitExhibitionYear itself still keeps the heading block in place --
    // it only slices at <h2> boundaries, it does not dedupe. Task 37, part
    // A1: extractAll runs removeExhibitionTitleDuplicateBlocks (below)
    // straight after this, on the article this function returns, which is
    // what actually drops the now-redundant heading block. Tested here in
    // isolation, so this function's own job (splitting) stays provably
    // separate from that later cleanup pass.
    expect(result[0].blocks).toEqual(article.blocks)
  })

  // A heading's text becomes `title`, a plain-text field React escapes on
  // render, so an entity surviving the split prints literally on the page.
  // Two real exhibitions shipped with "&amp;" showing in their title, their
  // <h1>, their card and their tab title before this was fixed.
  it('decodes HTML entities in the heading, since `title` is plain text, not HTML', () => {
    const article = baseArticle({
      blocks: [
        { type: 'text', value: { fr: '<h2>Galerie Dutko &amp; Cie</h2>', en: '<h2>Dutko &amp; Co</h2>' } },
      ],
    })
    const [entry] = splitExhibitionYear(article)
    expect(entry.title).toEqual({ fr: 'Galerie Dutko & Cie', en: 'Dutko & Co' })
  })

  it('splits a year with multiple entries into that many articles, one per <h2>', () => {
    const article = baseArticle({
      blocks: [
        { type: 'text', value: { fr: '<h2>Premier lieu</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 1 } }] },
        { type: 'text', value: { fr: '<h2>Second lieu</h2>', en: '' } },
        { type: 'text', value: { fr: '<p>© Photographe</p>', en: '' } },
        { type: 'gallery', columns: 3, items: [{ image: { legacyWpId: 2 } }] },
      ],
    })
    const result = splitExhibitionYear(article)
    expect(result).toHaveLength(2)
    expect(result[0].title.fr).toBe('Premier lieu')
    expect(result[0].blocks).toEqual(article.blocks.slice(0, 2))
    expect(result[1].title.fr).toBe('Second lieu')
    expect(result[1].blocks).toEqual(article.blocks.slice(2))
  })

  // The public API's article list sorts by `position` first (see
  // api/src/routes/public.js), ahead of yearStart/createdAt -- without a
  // real position here, two same-year exhibitions would fall back to
  // createdAt, which (since load.js inserts them in this same array order,
  // each getting a LATER timestamp than the last) sorts them in REVERSE of
  // the order they actually appear on the original page. This is what
  // makes "the year's first exhibition" mean the first one in source
  // order, not an accident of insertion order.
  it('numbers each split entry by its position among the year\'s own siblings, in source order', () => {
    const article = baseArticle({
      blocks: [
        { type: 'text', value: { fr: '<h2>Premier lieu</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'text', value: { fr: '<h2>Second lieu</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'text', value: { fr: '<h2>Troisieme lieu</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const result = splitExhibitionYear(article)
    expect(result.map((a) => a.position)).toEqual([0, 1, 2])
  })

  it('strips tags and collapses embedded whitespace/newlines from the heading text', () => {
    const article = baseArticle({
      blocks: [
        {
          type: 'text',
          value: {
            fr: '<h2>Cycle l’Eternel détour, séquence printemps 2013,\nPartage de minuit</h2>',
            en: '',
          },
        },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    expect(splitExhibitionYear(article)[0].title.fr).toBe('Cycle l’Eternel détour, séquence printemps 2013, Partage de minuit')
  })

  it('leaves the English title blank when the English heading is blank', () => {
    const article = baseArticle({
      blocks: [
        { type: 'text', value: { fr: '<h2>Musée Untel</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    expect(splitExhibitionYear(article)[0].title.en).toBe('')
  })

  it('assigns each split entry a deterministic, negative, unique legacyWpId derived from the parent', () => {
    const article = baseArticle({
      legacyWpId: 17452,
      blocks: [
        { type: 'text', value: { fr: '<h2>Premier</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
        { type: 'text', value: { fr: '<h2>Second</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const result = splitExhibitionYear(article)
    expect(result[0].legacyWpId).toBeLessThan(0)
    expect(result[1].legacyWpId).toBeLessThan(0)
    expect(result[0].legacyWpId).not.toBe(result[1].legacyWpId)
    // Stable across a re-run of the same source: re-splitting the identical
    // input produces the identical ids, not fresh ones each time.
    expect(splitExhibitionYear(article).map((a) => a.legacyWpId)).toEqual(result.map((a) => a.legacyWpId))
  })

  it('never collides with a real (positive) WordPress post id from a different year', () => {
    const year1 = baseArticle({
      legacyWpId: 100,
      blocks: [
        { type: 'text', value: { fr: '<h2>A</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const year2 = baseArticle({
      legacyWpId: 200,
      blocks: [
        { type: 'text', value: { fr: '<h2>B</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    const ids = [...splitExhibitionYear(year1), ...splitExhibitionYear(year2)].map((a) => a.legacyWpId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id < 0)).toBe(true)
  })

  // Blank here (never generated during extraction, which has no access to
  // the live Mongo state a real uniqueness check needs) -- resolved at
  // load time instead (migrate/load.js), the same place/pattern the admin
  // API's own ensureSlug() already uses.
  it('leaves the slug blank, for load.js to resolve uniquely against the live database', () => {
    const article = baseArticle({
      blocks: [
        { type: 'text', value: { fr: '<h2>Musée Untel</h2>', en: '' } },
        { type: 'gallery', columns: 3, items: [] },
      ],
    })
    expect(splitExhibitionYear(article)[0].slug).toEqual({ fr: '', en: '' })
  })
})

// Task 37, part A1. The split (splitExhibitionYear above) promotes each
// exhibition's own <h2> heading into `title`, but the heading itself stays
// in the split entry's own `blocks` -- an oversight of the split, not a
// deliberate design: the same text then prints twice, once as the article's
// own `title`, once again as a body block, on all 39 real exhibitions.
// Content-matched (tags stripped, whitespace collapsed, both sides trimmed),
// exactly like removeSubtitleDuplicateBlocks -- not by position, since a
// second, later duplicate is just as real a duplicate as the first.
describe('removeExhibitionTitleDuplicateBlocks', () => {
  const textBlock = (fr, en = '') => ({ type: 'text', value: { fr, en } })

  it('removes a text block whose entire content exactly duplicates the title', () => {
    const blocks = [
      textBlock('<h2>Rectos / Versos, Galerie Espace Muraille, Genève</h2>'),
      { type: 'gallery', items: [] },
      textBlock('<p>© Luca Fascini 2023</p>'),
    ]
    const title = { fr: 'Rectos / Versos, Galerie Espace Muraille, Genève', en: '' }
    expect(removeExhibitionTitleDuplicateBlocks(blocks, title)).toEqual([blocks[1], blocks[2]])
  })

  it('leaves a block whose content only starts with the title and continues with real prose', () => {
    const blocks = [textBlock('<h2>Musée Untel, avec un sous-titre en plus</h2>')]
    const title = { fr: 'Musée Untel', en: '' }
    expect(removeExhibitionTitleDuplicateBlocks(blocks, title)).toEqual(blocks)
  })

  it('reports a block that starts with the title and continues, via the partialMatches sink', () => {
    const blocks = [textBlock('<h2>Musée Untel, avec un sous-titre en plus</h2>')]
    const title = { fr: 'Musée Untel', en: '' }
    const partialMatches = []
    removeExhibitionTitleDuplicateBlocks(blocks, title, partialMatches)
    expect(partialMatches).toEqual([blocks[0]])
  })

  it('normalizes a <br/> inside the block to whitespace before comparing, like the subtitle rule', () => {
    const blocks = [textBlock('<h2>Cycle l’Eternel détour, séquence printemps 2013,<br/>Partage de minuit</h2>')]
    const title = { fr: 'Cycle l’Eternel détour, séquence printemps 2013, Partage de minuit', en: '' }
    expect(removeExhibitionTitleDuplicateBlocks(blocks, title)).toEqual([])
  })

  it('never removes a non-text block', () => {
    const blocks = [{ type: 'gallery', items: [] }]
    const title = { fr: 'Anything', en: '' }
    expect(removeExhibitionTitleDuplicateBlocks(blocks, title)).toEqual(blocks)
  })

  it('does nothing when there is no title to match against', () => {
    const blocks = [textBlock('<h2>x</h2>')]
    expect(removeExhibitionTitleDuplicateBlocks(blocks, { fr: '', en: '' })).toEqual(blocks)
  })

  it('removes only the matching block, leaving an unrelated later duplicate elsewhere untouched (defensive: none exist in the real archive)', () => {
    const blocks = [
      textBlock('<h2>Musée Untel</h2>'),
      { type: 'gallery', items: [] },
      textBlock('<p>Musée Untel</p>'),
    ]
    const title = { fr: 'Musée Untel', en: '' }
    expect(removeExhibitionTitleDuplicateBlocks(blocks, title)).toEqual([blocks[1]])
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

describe('decodeEntities', () => {
  it('decodes the named entities WordPress emits', () => {
    expect(decodeEntities('Dijon &amp; Magnin')).toBe('Dijon & Magnin')
    expect(decodeEntities('a&nbsp;b')).toBe('a b')
    expect(decodeEntities('&quot;Retourner voir&quot;')).toBe('"Retourner voir"')
    expect(decodeEntities('&lt;p&gt;')).toBe('<p>')
  })

  it('decodes decimal and hexadecimal numeric references', () => {
    expect(decodeEntities('l&#8217;autre')).toBe('l\u2019autre')
    expect(decodeEntities('l&#x2019;autre')).toBe('l\u2019autre')
  })

  // &amp; is decoded last on purpose: decoding it first would turn a
  // literal, doubly-escaped `&amp;lt;` into `<`, manufacturing markup the
  // source never contained.
  it('does not manufacture markup out of a doubly-escaped entity', () => {
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;')
  })

  it('leaves a bare ampersand and an unknown entity alone', () => {
    expect(decodeEntities('R & D')).toBe('R & D')
    expect(decodeEntities('&fakeentity;')).toBe('&fakeentity;')
  })
})
