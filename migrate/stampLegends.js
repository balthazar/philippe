/**
 * Writes each photograph's legend onto the image itself, so the lightbox can
 * show it in fullscreen where the article's own list is off screen.
 *
 * The legend is derived from the article that shows the photograph (see
 * legends.js), and lands in `Image.alt` -- the media library's "Texte
 * alternatif" field, which until now was empty on every image in the
 * archive. That makes it editable by hand afterwards, in the one place an
 * editor would look for it.
 *
 * Run:
 *   node stampLegends.js            # report only, writes nothing
 *   node stampLegends.js --write    # actually write
 *   node stampLegends.js --write --force   # also overwrite non-empty alts
 *
 * Idempotent and re-runnable. By default it never overwrites an alt that
 * already has something in it: a second run after the artist has corrected
 * one by hand must not put the derived text back. `--force` exists for the
 * case where the derivation itself was wrong and needs replacing wholesale.
 *
 * An image used by more than one article (a work's cover also appearing in
 * an exhibition's gallery, say) is stamped once, by whichever article claims
 * it first, and reported -- `alt` belongs to the image, not to the article,
 * so there is only one to give and a second write would just be a coin toss.
 */
import { connect, disconnect } from '../api/src/db.js'
import { Article } from '../api/src/models/Article.js'
import { Image } from '../api/src/models/Image.js'
import { legendsFor, visiblePhotographs } from './legends.js'

const WRITE = process.argv.includes('--write')
const FORCE = process.argv.includes('--force')

export async function stampLegends({ write = false, force = false, log = console.log } = {}) {
  const articles = await Article.find({}).sort({ 'slug.fr': 1 }).lean()

  const stats = { matched: 0, mismatched: 0, noList: 0, written: 0, skippedFilled: 0, skippedShared: 0 }
  const skipped = { mismatched: [], noList: [] }
  const claimedBy = new Map()
  const shared = []

  for (const article of articles) {
    const result = legendsFor(article)
    if (!result) continue
    if (result.status === 'no-list') {
      stats.noList += 1
      skipped.noList.push({ slug: article.slug?.fr, category: article.category, photographs: result.expected })
      continue
    }
    if (result.status === 'mismatched') {
      stats.mismatched += 1
      skipped.mismatched.push({
        slug: article.slug?.fr,
        category: article.category,
        photographs: result.expected,
        legends: result.legends.length,
      })
      continue
    }

    stats.matched += 1
    const photographs = visiblePhotographs(article)
    for (const [i, item] of photographs.entries()) {
      const text = result.legends[i].text
      if (!text || !item.image) continue

      const id = String(item.image)
      if (claimedBy.has(id)) {
        stats.skippedShared += 1
        shared.push({ image: id, first: claimedBy.get(id), also: article.slug?.fr })
        continue
      }
      claimedBy.set(id, article.slug?.fr)

      const image = await Image.findById(id).lean()
      if (!image) continue
      if (!force && (image.alt?.fr || image.alt?.en)) {
        stats.skippedFilled += 1
        continue
      }
      // French only. `alt` follows this project's usual localization rule
      // (`en || fr`, see api/src/lib/localize.js), so leaving `en` empty
      // means an English reader is shown the French legend rather than
      // nothing -- which is right: these are the works' actual titles, and
      // the archive already leaves them untranslated everywhere else.
      if (write) {
        await Image.updateOne({ _id: id }, { $set: { 'alt.fr': text } })
        stats.written += 1
      } else {
        stats.written += 1
      }
    }
  }

  log(`${write ? 'WROTE' : 'WOULD WRITE'} ${stats.written} legends across ${stats.matched} articles`)
  log(`skipped: ${stats.mismatched} articles with a list that does not match the photograph count`)
  log(`         ${stats.noList} articles with no list at all (${skipped.noList.reduce((n, s) => n + s.photographs, 0)} photographs)`)
  if (stats.skippedFilled) log(`         ${stats.skippedFilled} images whose alt was already filled in (use --force to replace)`)
  if (stats.skippedShared) log(`         ${stats.skippedShared} images already claimed by an earlier article`)

  if (skipped.mismatched.length) {
    log('\nMISMATCHED -- needs a human, nothing was written:')
    for (const s of skipped.mismatched) log(`  ${s.slug}: ${s.photographs} photographs, ${s.legends} legends`)
  }
  if (shared.length) {
    log('\nSHARED IMAGES -- stamped from the first article only:')
    for (const s of shared) log(`  ${s.image}: ${s.first} (also in ${s.also})`)
  }
  return { stats, skipped, shared }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connect()
  await stampLegends({ write: WRITE, force: FORCE })
  if (!WRITE) console.log('\nDry run. Pass --write to apply.')
  await disconnect()
}
