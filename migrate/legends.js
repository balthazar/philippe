/**
 * Derives each photograph's legend from the article that shows it.
 *
 * No image on this site carries a legend of its own: the artist writes them
 * as a list in the article's body, one entry per photograph, in gallery
 * order, and the reader matches list to picture by counting. That works on
 * the page, where both are visible at once, and not at all in the lightbox,
 * where the list is off screen. This module turns that list back into
 * per-image data so the lightbox can show each photograph its own line.
 *
 * It is deliberately conservative. Every article is matched by COUNT before
 * anything is written: a list that does not account for exactly the
 * photographs the gallery shows is reported, never guessed at, never
 * stretched to fit. Mis-stamping a legend is worse than leaving one blank --
 * a blank is visibly missing, a wrong one reads as fact.
 */

/**
 * Flattens a text block to plain lines. Both `</p>` and `<br>` end a line:
 * the artist uses them interchangeably, sometimes within a single entry
 * (a title line and a dimensions line separated by `<br>`, entries
 * separated by `</p>`), and sometimes the other way round.
 */
export function toLines(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h2|h3)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
}

/**
 * A dimensions line: "60 x 60 cm", "Ø 120 cm", "36 x 41 cm / 14,2 x 16,1 in.".
 * This is the signal that a paragraph is a legend rather than prose -- it is
 * what an unnumbered list (below) is recognised by, and prose in this
 * archive never contains one.
 */
const DIMENSIONS = /(\d+([.,]\d+)?\s*[x×]\s*\d+([.,]\d+)?\s*(cm|mm|in\b))|(Ø\s*\d+)/i

/** A numbered entry opens its line: "1." or "1)". */
const NUMBERED = /^(\d{1,3})\s*[.)]\s*(.*)$/

/**
 * Numbered form: "1. Bouton poussoir n°1 - 2021".
 *
 * Numbers ascend but are NOT required to be gapless -- the artist skips one
 * where a photograph was never made (Verso n°27), and treating a gap as
 * "not a boundary" would swallow every later entry into the one before it.
 * They must still ASCEND, and by no more than 20 at a time: a line opening
 * "1998" is a year, and a legend's own continuation line ("60 x 60 cm")
 * must never be mistaken for entry 60.
 */
export function parseNumbered(html) {
  const entries = []
  let last = 0
  for (const line of toLines(html)) {
    const m = line.match(NUMBERED)
    if (m && Number(m[1]) > last && Number(m[1]) <= last + 20) {
      last = Number(m[1])
      entries.push({ n: last, lines: m[2] ? [m[2]] : [] })
    } else if (entries.length && line) {
      entries[entries.length - 1].lines.push(line)
    }
  }
  if (!entries.length || entries[0].n !== 1) return null
  return entries.map((e) => ({ n: e.n, text: joinLines(e.lines) }))
}

/**
 * Unnumbered form, same list without the numerals: one paragraph per
 * photograph, each a title line and (usually) a dimensions line. Used by
 * Grattoirs, Châteaux de sable and Couvertures.
 *
 * Recognised ONLY when most paragraphs carry dimensions. Without that test
 * this would match any multi-paragraph text block on the site -- every
 * article's opening prose included -- and the count check alone would let a
 * three-paragraph essay be stamped onto a three-photograph gallery.
 */
export function parseUnnumbered(html) {
  const paragraphs = String(html || '')
    .split(/<\/p>/i)
    .flatMap((p) => splitOnBlankLines(toLines(p)))
    .filter((lines) => lines.length)
  if (paragraphs.length < 2) return null
  if (paragraphs.some((lines) => lines.some((l) => NUMBERED.test(l)))) return null
  const withDimensions = paragraphs.filter((lines) => lines.some((l) => DIMENSIONS.test(l))).length
  if (withDimensions < paragraphs.length / 2) return null
  return paragraphs.map((lines, i) => ({ n: i + 1, text: joinLines(lines) }))
}

/**
 * A blank line ends an entry as surely as a paragraph break does. Châteaux de
 * sable keeps n°7, n°8 and n°9 in ONE paragraph separated by `<br /><br />`,
 * where every other entry has a paragraph of its own -- the difference
 * between pressing Enter and Shift-Enter twice, which looks identical on the
 * page and is invisible to anyone writing the list. Treating only `</p>` as a
 * separator silently folded three works into one legend and left two
 * photographs unaccounted for.
 */
function splitOnBlankLines(lines) {
  const groups = [[]]
  for (const line of lines) {
    if (line) groups[groups.length - 1].push(line)
    else if (groups[groups.length - 1].length) groups.push([])
  }
  return groups.filter((g) => g.length)
}

/**
 * A legend's own lines, rejoined for a single-line display. Comma, not a
 * dash: the artist's own titles already use " - " to separate the work from
 * its year, and reusing it here would make "Ampli Ampeg - 2003 - 52 x 48 cm"
 * read as three peers instead of a title, its year, and its size.
 */
function joinLines(lines) {
  return lines.map((l) => l.trim()).filter(Boolean).join(', ').replace(/\s*,\s*$/, '').trim()
}

/**
 * The photographs the gallery actually shows, in order. `hidden` items are
 * excluded -- BlockRenderer filters them out of both the grid and the
 * lightbox's own image list, so they are not among the pictures a reader
 * can ever count, and including them here would offset every legend after
 * the first hidden one by a place.
 */
export function visiblePhotographs(article) {
  return (article.blocks || [])
    .filter((b) => b.type === 'gallery')
    .flatMap((g) => (g.items || []).filter((it) => !it.hidden))
}

/**
 * The article's legends, or null. Returns the candidate list that accounts
 * for exactly the photographs on show; where several text blocks parse (an
 * article can hold both a numbered list and a prose block that happens to
 * carry dimensions), the count is what decides between them, so a wrong
 * candidate cannot win by being first.
 */
export function legendsFor(article) {
  const expected = visiblePhotographs(article).length
  if (!expected) return null
  const candidates = (article.blocks || [])
    .filter((b) => b.type === 'text')
    .flatMap((b) => [parseNumbered(b.value?.fr), parseUnnumbered(b.value?.fr)])
    .filter((c) => c && c.length)
  const exact = candidates.find((c) => c.length === expected)
  if (exact) return { legends: exact, expected, status: 'matched' }
  if (!candidates.length) return { legends: null, expected, status: 'no-list' }
  // Longest, so the report names the closest near-miss rather than whichever
  // block happened to parse first.
  const best = candidates.sort((a, b) => b.length - a.length)[0]
  return { legends: best, expected, status: 'mismatched' }
}
