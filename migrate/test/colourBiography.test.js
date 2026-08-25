import { describe, it, expect } from 'vitest'
import { colourYears, colourHeadings, colourBiographyHtml } from '../colourBiography.js'

const MUTED = '<span class="text-muted">'

describe('colourYears', () => {
  it('wraps a year that labels a group', () => {
    expect(colourYears('<p>2024<br />— Lumières d’Italie</p>'))
      .toBe(`<p><strong>${MUTED}2024</span></strong><br />— Lumières d’Italie</p>`)
  })

  it('wraps a span of years', () => {
    expect(colourYears('<p>2003-2004<br />— ISCP</p>')).toContain(`${MUTED}2003-2004</span>`)
  })

  it('wraps a year standing alone in its own paragraph', () => {
    expect(colourYears('<p>2026</p><p>— Bi-centenaire</p>')).toBe(`<p><strong>${MUTED}2026</span></strong></p><p>— Bi-centenaire</p>`)
  })

  it('wraps every year in a run, not only the first', () => {
    const out = colourYears('<p>2024<br />— Un<br />2023<br />— Deux</p>')
    expect(out.match(/text-muted/g)).toHaveLength(2)
  })

  // The distinction the whole regex exists to draw: a year that LABELS a
  // group is a label, a year inside an entry is part of a sentence.
  it('leaves a year inside an entry alone', () => {
    const html = '<p>2016<br />— <em>Philippe Gronon. Révéler</em>, Musée Picasso-Paris, 2016</p>'
    const out = colourYears(html)
    expect(out.match(/text-muted/g)).toHaveLength(1)
    expect(out).toContain('Musée Picasso-Paris, 2016</p>')
  })

  it('leaves a year in running prose alone', () => {
    const html = '<p>Né en 1964 à Rochefort sur Mer, vit et travaille à Malakoff</p>'
    expect(colourYears(html)).toBe(html)
  })

  // Re-runnable: the script is expected to be run again after the artist has
  // added entries by hand, and must not nest a second wrapper round the ones
  // it already did.
  it('leaves an already-coloured year alone', () => {
    const done = `<p><strong>${MUTED}2024</span></strong><br />— Un</p>`
    expect(colourYears(done)).toBe(done)
  })

  it('is idempotent over a whole block', () => {
    const once = colourYears('<p>2024<br />— Un<br />2023<br />— Deux</p>')
    expect(colourYears(once)).toBe(once)
  })
})

describe('colourHeadings', () => {
  it('wraps the heading’s content, never classing the heading itself', () => {
    expect(colourHeadings('<h3>• EXPOSITIONS PERSONNELLES</h3>'))
      .toBe(`<h3>${MUTED}• EXPOSITIONS PERSONNELLES</span></h3>`)
    expect(colourHeadings('<h3>x</h3>')).not.toContain('<h3 class')
  })

  it('keeps markup inside the heading', () => {
    expect(colourHeadings('<h2>• BOURSES &amp; RÉSIDENCES</h2>')).toBe(`<h2>${MUTED}• BOURSES &amp; RÉSIDENCES</span></h2>`)
  })

  it('leaves an already-coloured heading alone', () => {
    const done = `<h3>${MUTED}• DISTINCTIONS</span></h3>`
    expect(colourHeadings(done)).toBe(done)
  })

  it('leaves a paragraph alone', () => {
    expect(colourHeadings('<p>Pas un titre</p>')).toBe('<p>Pas un titre</p>')
  })
})

describe('colourBiographyHtml', () => {
  it('is idempotent, so the script can be re-run over a page half of which is already done', () => {
    const html = '<h3>• DISTINCTIONS</h3>'
    const once = colourBiographyHtml(html)
    expect(colourBiographyHtml(once)).toBe(once)
  })

  it('leaves an empty value alone', () => {
    expect(colourBiographyHtml('')).toBe('')
  })
})
