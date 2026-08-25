import { describe, it, expect } from 'vitest'
import { toLines, parseNumbered, parseUnnumbered, visiblePhotographs, legendsFor } from '../legends.js'

const text = (fr) => ({ type: 'text', value: { fr, en: '' } })
const gallery = (n, hidden = []) => ({
  type: 'gallery',
  items: Array.from({ length: n }, (_, i) => ({ image: `img${i}`, hidden: hidden.includes(i) })),
})

describe('toLines', () => {
  it('ends a line on </p> and on <br> alike, since the artist uses both', () => {
    expect(toLines('<p>a<br />b</p><p>c</p>')).toEqual(['a', 'b', 'c', ''])
  })

  it('strips tags and decodes entities', () => {
    expect(toLines('<p><em>Ampli</em> Hughes &amp; Kettner</p>')[0]).toBe('Ampli Hughes & Kettner')
  })
})

describe('parseNumbered', () => {
  it('reads one entry per number, in order', () => {
    const parsed = parseNumbered('<p>1. Bouton n°1 - 2021</p><p>2. Bouton n°2 - 2021</p>')
    expect(parsed.map((e) => e.text)).toEqual(['Bouton n°1 - 2021', 'Bouton n°2 - 2021'])
  })

  it('keeps a continuation line with its own entry', () => {
    const parsed = parseNumbered('<p>1. Écritoire n°19 - 1996<br />60 x 60 cm</p><p>2. Écritoire n°41 - 1996<br />60 x 60 cm</p>')
    expect(parsed[0].text).toBe('Écritoire n°19 - 1996, 60 x 60 cm')
    expect(parsed).toHaveLength(2)
  })

  // Chariots de composition puts entries 8 and 9 in one paragraph, separated
  // by <br /><br />. A paragraph-per-entry parser silently loses the last one.
  it('splits entries sharing a paragraph', () => {
    const parsed = parseNumbered('<p>1. Un<br />100 x 50 cm<br /><br />2. Deux<br />100 x 50 cm</p>')
    expect(parsed.map((e) => e.n)).toEqual([1, 2])
    expect(parsed[1].text).toBe('Deux, 100 x 50 cm')
  })

  // Versos numbers 1..62 but skips 27 (no photograph was made). Requiring a
  // gapless run made entry 26 swallow every later legend into itself.
  it('tolerates a gap in the numbering without swallowing the rest', () => {
    const parsed = parseNumbered('<p>1. Un</p><p>2. Deux</p><p>4. Quatre</p>')
    expect(parsed.map((e) => e.n)).toEqual([1, 2, 4])
    expect(parsed[1].text).toBe('Deux')
  })

  // "60 x 60 cm" opens with a number too. Only an ASCENDING, nearby number
  // starts a new entry, or every dimensions line would become one.
  it('does not treat a dimensions line as a new entry', () => {
    const parsed = parseNumbered('<p>1. Écritoire<br />60 x 60 cm</p>')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].text).toBe('Écritoire, 60 x 60 cm')
  })

  it('returns null when the list does not start at 1', () => {
    expect(parseNumbered('<p>3. Trois</p><p>4. Quatre</p>')).toBeNull()
  })

  it('reads a lone entry, for a work that is a single photograph', () => {
    const parsed = parseNumbered('<p>1. Porte Abri Anti-Nucléaire, Bercy - 2023</p>')
    expect(parsed.map((e) => e.text)).toEqual(['Porte Abri Anti-Nucléaire, Bercy - 2023'])
  })
})

describe('parseUnnumbered', () => {
  it('reads one entry per paragraph when each carries dimensions', () => {
    const parsed = parseUnnumbered('<p>Château n°1 - 2002<br />80 x 120 cm</p><p>Château n°2 - 2002<br />80 x 120 cm</p>')
    expect(parsed.map((e) => e.text)).toEqual(['Château n°1 - 2002, 80 x 120 cm', 'Château n°2 - 2002, 80 x 120 cm'])
  })

  // Without the dimensions test this would match any multi-paragraph block,
  // and an article's opening prose would be stamped onto its photographs.
  it('refuses a prose block, however many paragraphs it has', () => {
    expect(parseUnnumbered('<p>Les tas de fumier fumant dans les campagnes.</p><p>Objets de transit.</p>')).toBeNull()
  })

  it('leaves a numbered list to parseNumbered', () => {
    expect(parseUnnumbered('<p>1. Un<br />60 x 60 cm</p><p>2. Deux<br />60 x 60 cm</p>')).toBeNull()
  })

  it('recognises a diameter as a dimension', () => {
    const parsed = parseUnnumbered('<p>Antenne n°1 - 1998<br />Ø 120 cm</p><p>Antenne n°2 - 1998<br />Ø 120 cm</p>')
    expect(parsed).toHaveLength(2)
  })
})

describe('visiblePhotographs', () => {
  it('excludes hidden items, which the lightbox never shows', () => {
    const article = { blocks: [gallery(4, [1])] }
    expect(visiblePhotographs(article).map((i) => i.image)).toEqual(['img0', 'img2', 'img3'])
  })
})

describe('legendsFor', () => {
  it('matches when the list accounts for exactly the visible photographs', () => {
    const article = { blocks: [text('<p>1. Un</p><p>2. Deux</p>'), gallery(2)] }
    expect(legendsFor(article).status).toBe('matched')
  })

  // A hidden item is not a photograph a reader can count, so a list that
  // matches the VISIBLE count is correct even though it is one short of the
  // items actually stored on the block.
  it('counts against visible photographs, not stored items', () => {
    const article = { blocks: [text('<p>1. Un</p><p>2. Deux</p>'), gallery(3, [2])] }
    expect(legendsFor(article).status).toBe('matched')
  })

  it('reports a mismatch rather than stretching the list to fit', () => {
    const article = { blocks: [text('<p>1. Un</p><p>2. Deux</p>'), gallery(3)] }
    const result = legendsFor(article)
    expect(result.status).toBe('mismatched')
    expect(result.expected).toBe(3)
    expect(result.legends).toHaveLength(2)
  })

  it('reports no-list for a gallery with nothing to draw on', () => {
    expect(legendsFor({ blocks: [text('<p>De la prose.</p>'), gallery(2)] }).status).toBe('no-list')
  })

  // An article can hold both its numbered list and a prose block that happens
  // to parse. The count is what picks between them, not source order.
  it('prefers the candidate that accounts for the photographs, whatever its position', () => {
    const article = {
      blocks: [
        text('<p>Un titre<br />30 x 30 cm</p><p>Autre chose<br />30 x 30 cm</p>'),
        text('<p>1. Vrai n°1</p><p>2. Vrai n°2</p><p>3. Vrai n°3</p>'),
        gallery(3),
      ],
    }
    const result = legendsFor(article)
    expect(result.status).toBe('matched')
    expect(result.legends[0].text).toBe('Vrai n°1')
  })

  it('returns null for an article with no gallery at all', () => {
    expect(legendsFor({ blocks: [text('<p>1. Un</p><p>2. Deux</p>')] })).toBeNull()
  })
})
