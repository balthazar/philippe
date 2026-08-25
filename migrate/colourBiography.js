/**
 * Colours the biography page: its section headings, and the year that opens
 * each entry beneath them.
 *
 * The page is one long run of `text` blocks whose entries look like
 *
 *   2024<br />— Lumières d'Italie, Galerie Aveline<br />2023<br />— …
 *
 * so a year is not an element and cannot be reached by a selector: nothing
 * in CSS can style a bare text node. Making the years read differently from
 * the entries therefore means putting real markup around them, which is what
 * this does, once, over stored content -- and why the colour classes it
 * writes are ones the admin's own editor can read back and re-apply (see
 * site/src/admin/textColor.js), rather than styling only a script can undo.
 *
 * Run:
 *   node colourBiography.js            # report only, writes nothing
 *   node colourBiography.js --write
 *
 * Idempotent: a year already wrapped is left alone, so a second run is a
 * no-op and a hand edit in between survives it.
 */
import { connect, disconnect } from '../api/src/db.js'
import { Page } from '../api/src/models/Page.js'

const WRITE = process.argv.includes('--write')

/**
 * A year, or a span of them, standing alone as a line: "2024", "2003-2004",
 * "1999-2001". Anchored to the start of a line -- the beginning of the
 * string, or straight after a <br> or a <p> -- and required to run to the
 * end of one, so a year INSIDE an entry ("Philippe Gronon. Révéler, Musée
 * Picasso-Paris, 2016") is left exactly as it is. Only the year that labels
 * a group is a label; the rest are part of a sentence.
 */
const YEAR_LINE = /(^|<br\s*\/?>|<p>)(\s*)(\d{4}(?:\s*[-–]\s*\d{4})?)(\s*)(?=<br\s*\/?>|<\/p>|$)/gi

/** Already coloured (by an earlier run, or by hand in the admin). */
const ALREADY = /<span class="text-[a-z]+">/i

export function colourYears(html) {
  if (!html) return html
  return String(html).replace(YEAR_LINE, (match, open, before, year, after) => {
    if (ALREADY.test(match)) return match
    return `${open}${before}<strong><span class="text-muted">${year}</span></strong>${after}`
  })
}

/**
 * The "• EXPOSITIONS PERSONNELLES" headings. The class goes on a span INSIDE
 * the heading, never on the <h3> itself: a heading node has nowhere to keep
 * a class, so one written there would be dropped the first time the artist
 * opened that block in the admin -- the colour would hold on the public site
 * right up until someone edited it, then vanish for no visible reason.
 */
export function colourHeadings(html) {
  if (!html) return html
  return String(html).replace(/<(h2|h3)>([\s\S]*?)<\/\1>/gi, (match, tag, inner) => {
    if (ALREADY.test(inner)) return match
    return `<${tag}><span class="text-muted">${inner}</span></${tag}>`
  })
}

export const colourBiographyHtml = (html) => colourHeadings(colourYears(html))

export async function colourBiography({ write = false, log = console.log } = {}) {
  const page = await Page.findOne({ key: 'biography' }).lean()
  if (!page) throw new Error('no biography page')

  let changed = 0
  const blocks = page.blocks.map((block) => {
    if (block.type !== 'text') return block
    const value = { fr: colourBiographyHtml(block.value?.fr), en: colourBiographyHtml(block.value?.en) }
    if (value.fr !== block.value?.fr || value.en !== block.value?.en) changed += 1
    return { ...block, value }
  })

  log(`${changed} of ${page.blocks.length} blocks would change`)
  for (const [i, block] of blocks.entries()) {
    const before = page.blocks[i].value?.fr || ''
    if (block.value?.fr === before) continue
    log(`\n[${i}] ${before.slice(0, 120)}`)
    log(`  -> ${block.value.fr.slice(0, 200)}`)
  }

  if (write && changed) {
    await Page.updateOne({ _id: page._id }, { $set: { blocks } })
    log(`\nwrote ${changed} blocks`)
  }
  return { changed }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connect()
  await colourBiography({ write: WRITE })
  if (!WRITE) console.log('\nDry run. Pass --write to apply.')
  await disconnect()
}
