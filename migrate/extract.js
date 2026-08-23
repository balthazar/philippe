import { writeFile, mkdir } from 'node:fs/promises'
import { query, close } from './db.js'
import { mapElementorToBlocks } from './elementor.js'

const CATEGORY_MAP = {
  'Œuvres': 'works', 'Oeuvres': 'works', 'Works': 'works',
  'Expositions': 'exhibitions', 'Exhibitions': 'exhibitions',
  'Éditions': 'editions', 'Editions': 'editions',
  'Commandes publiques': 'public-orders', 'Public Orders': 'public-orders',
}

export function mapCategory(name) {
  const mapped = CATEGORY_MAP[String(name).trim()]
  if (!mapped) throw new Error(`unmapped category: ${name}`)
  return mapped
}

/** Titles carry their date as a trailing "| 2018-2021" segment. */
export function parseYearLabel(rawTitle) {
  const title = String(rawTitle || '').trim()
  const match = title.match(/^(.*?)\s*\|\s*((\d{4})(?:\s*-\s*(\d{4}))?)$/)
  if (!match) return { title, yearLabel: '', yearStart: null, yearEnd: null }
  return {
    title: match[1].trim(),
    yearLabel: match[2].replace(/\s*-\s*/, '-'),
    yearStart: Number(match[3]),
    yearEnd: Number(match[4] || match[3]),
  }
}

/** Groups WPML rows by trid. FR is the base; EN alone becomes the base. */
export function pairByTrid(rows) {
  const byTrid = new Map()
  for (const row of rows) {
    const entry = byTrid.get(row.trid) || {}
    if (entry[row.language_code]) {
      throw new Error(`duplicate ${row.language_code} row for trid ${row.trid}: a post has more than one category or translation row`)
    }
    entry[row.language_code] = row
    byTrid.set(row.trid, entry)
  }
  return [...byTrid.values()].map((entry) => ({
    fr: entry.fr || entry.en,
    en: entry.en || null,
    enOnly: !entry.fr && Boolean(entry.en),
  }))
}

/**
 * Throws when a join dropped rows. A silently-dropped French translation
 * row is otherwise indistinguishable from a legitimate English-only
 * article, so this must run before pairing, not after.
 */
export function assertRowCount(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `extraction lost rows: joined ${actual} of ${expected} ${label}. ` +
      `A post is missing a translation or category row; fix the source data rather than the query.`
    )
  }
}

/** Splits a leading `<p>...</p>` off an HTML string. Returns null when the
 * string does not begin with exactly that shape (e.g. it starts with a
 * `<ul>`, or is empty), so a caller can tell "not a leading paragraph" apart
 * from "a leading paragraph with nothing after it". */
function splitLeadingParagraph(html) {
  const match = String(html || '').match(/^\s*<p>([\s\S]*?)<\/p>\s*([\s\S]*)$/)
  if (!match) return null
  return { first: match[1].trim(), rest: match[2].trim() }
}

// A terse process/materials label ("Numérisation, épreuves numériques
// pigmentaires") never ends in a full stop, exclamation or question mark;
// a narrative sentence almost always does. This is the one content signal
// extractSubtitle uses, deliberately narrow, to tell the two apart.
const TERMINAL_PUNCTUATION_RE = /[.!?]\s*$/

/**
 * Task 26, part A1. Every works article's first text block is technique/
 * materials metadata, not prose (the artist's own observation) -- structural
 * data sitting in a content block. Detected here by an explicit, inspectable
 * rule rather than a fuzzy heuristic: the first <p> of a works article's
 * first text block, kept as the subtitle ONLY when that paragraph does not
 * end in terminal sentence punctuation. Anything that doesn't fit -- no text
 * block, a block that doesn't open with a single leading paragraph, or a
 * first paragraph that reads as a real sentence -- is left as a block
 * untouched and reported as non-matching so it can be checked by eye.
 *
 * When the block holds more than the technique line (two real cases in the
 * archive: a technique line followed by real prose in the very same
 * Elementor text-editor widget), only the leading paragraph is lifted; the
 * remainder stays as a block, in place, in both languages.
 */
export function extractSubtitle(category, blocks) {
  const empty = { fr: '', en: '' }
  if (category !== 'works') return { subtitle: empty, blocks, matched: false, reason: 'not a works article' }

  const textIndexes = blocks.reduce((acc, b, i) => (b.type === 'text' ? [...acc, i] : acc), [])
  if (!textIndexes.length) return { subtitle: empty, blocks, matched: false, reason: 'no text block' }

  // Client feedback (task 27): tries every text block in turn, not only the
  // first one by type. On the real archive the technique line is usually
  // (but not always) the very first text block; when it isn't -- an earlier
  // block is real prose -- the old, first-only version gave up entirely
  // instead of looking further, leaving both the subtitle unextracted and
  // the technique-line block sitting untouched in the article.
  let lastReason = 'no text block'
  for (const idx of textIndexes) {
    const block = blocks[idx]
    const frSplit = splitLeadingParagraph(block.value.fr)
    if (!frSplit) {
      lastReason = 'text block does not open with a single leading paragraph'
      continue
    }
    if (TERMINAL_PUNCTUATION_RE.test(frSplit.first)) {
      lastReason = 'first paragraph reads as prose (ends in sentence punctuation), not a technique line'
      continue
    }

    const enSplit = splitLeadingParagraph(block.value.en)
    const subtitle = {
      fr: frSplit.first,
      en: enSplit && !TERMINAL_PUNCTUATION_RE.test(enSplit.first) ? enSplit.first : '',
    }

    const restFr = frSplit.rest
    const restEn = enSplit ? enSplit.rest : ''
    const remainder = restFr || restEn ? [{ ...block, value: { fr: restFr, en: restEn } }] : []

    return {
      subtitle,
      blocks: [...blocks.slice(0, idx), ...remainder, ...blocks.slice(idx + 1)],
      matched: true,
    }
  }

  return { subtitle: empty, blocks, matched: false, reason: lastReason }
}

// Client feedback (task 27): the technique line lifted into `subtitle` above
// sometimes appears a SECOND time elsewhere in the article, as its own
// separate text block (measured: 30 of 63 articles). extractSubtitle only
// ever removes the one occurrence it matched on; this is a second,
// content-based pass over what's left, dropping any other text block whose
// entire content is exactly `<p>{subtitle}</p>` -- matched on content, not
// position, since position is what left these duplicates behind.
export function removeSubtitleDuplicateBlocks(blocks, subtitle) {
  if (!subtitle?.fr) return blocks
  return blocks.filter((b) => {
    if (b.type !== 'text') return true
    const split = splitLeadingParagraph(b.value?.fr)
    return !(split && !split.rest && split.first === subtitle.fr)
  })
}

function stripToPlainText(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
}

// Client feedback (task 27): 26 articles carry a text block whose fr and en
// are both empty -- renders nothing on the page, shows as a blank field in
// the editor. Judged after stripping tags and whitespace, so an empty
// `<p></p>` counts as empty even though it isn't the empty string. Never
// touches a non-`text` block: an image block with no image yet is the
// artist's own business, not this migration's.
export function removeEmptyTextBlocks(blocks = []) {
  return blocks.filter((b) => {
    if (b.type !== 'text') return true
    return stripToPlainText(b.value?.fr).length > 0 || stripToPlainText(b.value?.en).length > 0
  })
}

// Client feedback (task 27), replacing the original plan of keeping a
// separate cover picker forever: 37 of 63 articles have a cover that is not
// among their gallery images, and one has no gallery at all. Folds each such
// cover into the article's own gallery as a hidden item (creating the
// gallery when none exists), so the admin's two per-image toggles ("Cover",
// "Hidden from grid") can express every case -- no cover is lost, and no
// visible grid image is added, since the folded-in item is hidden.
export function ensureCoverInGallery({ coverLegacyId, blocks }) {
  if (!coverLegacyId) return blocks

  const alreadyPresent = blocks.some(
    (b) => b.type === 'gallery' && (b.items || []).some((it) => it.image?.legacyWpId === coverLegacyId)
  )
  if (alreadyPresent) return blocks

  const hiddenItem = { image: { legacyWpId: coverLegacyId }, caption: { fr: '', en: '' }, span: 1, hidden: true }
  const firstGalleryIdx = blocks.findIndex((b) => b.type === 'gallery')
  if (firstGalleryIdx === -1) return [...blocks, { type: 'gallery', columns: 3, items: [hiddenItem] }]

  return blocks.map((b, i) => (i === firstGalleryIdx ? { ...b, items: [...(b.items || []), hiddenItem] } : b))
}

/**
 * Task 26, part A3. icone-oeuvres.jpg was the old theme's menu-toggle icon
 * (a black circle and chevron): pure decoration, never a cover, never in a
 * gallery, never on a page. Drops any image block, or gallery item, whose
 * legacy id is in `legacyIdsToPurge` -- a set computed from the extracted
 * media list by filename (see extractAll), not hardcoded, so a re-run
 * against a fresh WordPress export still finds it under whatever id it was
 * assigned there.
 */
export function purgeImageBlocks(blocks = [], legacyIdsToPurge) {
  return blocks
    .map((block) => {
      if (block.type === 'image') {
        return legacyIdsToPurge.has(block.image?.legacyWpId) ? null : block
      }
      if (block.type === 'gallery') {
        const items = (block.items || []).filter((i) => !legacyIdsToPurge.has(i.image?.legacyWpId))
        if (!items.length) return null
        return items.length === (block.items || []).length ? block : { ...block, items }
      }
      return block
    })
    .filter(Boolean)
}

// Task 26, part B3. /contact carries six blocks in the source data: the
// mailto, a "Graphisme" credit, a logo image, a text-credit line, a "site
// créé par" line and a rights line. Reduced to just the mailto through the
// migration (a content change, not a special case in the renderer): the
// page stays an ordinary Page document, it just has one block. Matched on
// the exact sanitized HTML the mailto block produces, scoped to the
// 'contact' source slug, so no other page's blocks are touched.
const CONTACT_MAILTO_BLOCK_HTML = '<p><a href="mailto:info@philippegronon.com">info@philippegronon.com</a></p>'

export function reduceContactPageBlocks(sourceSlug, blocks) {
  if (sourceSlug !== 'contact') return blocks
  return blocks.filter((b) => b.type === 'text' && b.value.fr.trim() === CONTACT_MAILTO_BLOCK_HTML)
}

async function metaFor(ids, key) {
  if (!ids.length) return new Map()
  const rows = await query(
    `SELECT post_id, meta_value FROM {p}postmeta WHERE meta_key = ? AND post_id IN (?)`,
    [key, ids]
  )
  return new Map(rows.map((r) => [r.post_id, r.meta_value]))
}

export async function extractAll({ outDir = new URL('./data/', import.meta.url).pathname } = {}) {
  await mkdir(outDir, { recursive: true })

  try {
    const postRows = await query(`
      SELECT p.ID, p.post_title, p.post_name, p.post_date, p.post_status,
             t.trid, t.language_code, term.name AS category_name
      FROM {p}posts p
      JOIN {p}icl_translations t ON t.element_id = p.ID AND t.element_type = 'post_post'
      JOIN {p}term_relationships r ON r.object_id = p.ID
      JOIN {p}term_taxonomy tt ON tt.term_taxonomy_id = r.term_taxonomy_id AND tt.taxonomy = 'category'
      JOIN {p}terms term ON term.term_id = tt.term_id
      WHERE p.post_type = 'post' AND p.post_status = 'publish'
    `)

    const [{ n: expectedPosts }] = await query(
      `SELECT COUNT(*) AS n FROM {p}posts WHERE post_type = 'post' AND post_status = 'publish'`
    )
    assertRowCount(postRows.length, Number(expectedPosts), 'published posts')

    const ids = postRows.map((r) => r.ID)
    const elementor = await metaFor(ids, '_elementor_data')
    const thumbs = await metaFor(ids, '_thumbnail_id')

    const attachments = await query(`
      SELECT p.ID, p.post_title, p.post_mime_type, m.meta_value AS file
      FROM {p}posts p
      JOIN {p}postmeta m ON m.post_id = p.ID AND m.meta_key = '_wp_attached_file'
      WHERE p.post_type = 'attachment'
    `)

    const allMedia = attachments
      .filter((a) => String(a.post_mime_type).startsWith('image/'))
      .map((a) => ({ legacyWpId: a.ID, file: a.file, mime: a.post_mime_type, originalName: a.file.split('/').pop() }))

    // Task 26, part A3: icone-oeuvres.jpg, the old theme's menu-toggle icon,
    // is decoration only -- never a cover, never in a gallery, never on a
    // page. Computed by filename against the real extracted media list
    // (not hardcoded ids), so a re-run against a fresh WordPress export
    // still finds it under whatever attachment id it gets there.
    const PURGED_IMAGE_FILENAMES = new Set(['icone-oeuvres.jpg'])
    const purgedLegacyIds = new Set(
      allMedia.filter((m) => PURGED_IMAGE_FILENAMES.has(m.originalName)).map((m) => m.legacyWpId)
    )
    const media = allMedia.filter((m) => !purgedLegacyIds.has(m.legacyWpId))

    let subtitleMatched = 0
    const subtitleNonMatches = []
    let purgedImageBlockCount = 0
    let emptyTextBlocksRemoved = 0
    let subtitleDuplicateBlocksRemoved = 0
    let coversFoldedIntoGallery = 0

    const articles = pairByTrid(postRows).map((pair) => {
      const base = parseYearLabel(pair.fr.post_title)
      const en = pair.en && !pair.enOnly ? parseYearLabel(pair.en.post_title) : null
      const category = mapCategory(pair.fr.category_name)
      const rawBlocks = mapElementorToBlocks(
        JSON.parse(elementor.get(pair.fr.ID) || '[]'),
        JSON.parse((pair.en && !pair.enOnly && elementor.get(pair.en.ID)) || 'null'),
        { postId: pair.fr.ID }
      )
      const purged = purgeImageBlocks(rawBlocks, purgedLegacyIds)
      purgedImageBlockCount += rawBlocks.length - purged.length

      // Client feedback (task 27): empty text blocks are stripped BEFORE
      // subtitle extraction, so a stray empty block can never masquerade as
      // (or sit in front of) the real technique-line block.
      const withoutEmpty = removeEmptyTextBlocks(purged)
      emptyTextBlocksRemoved += purged.length - withoutEmpty.length

      const { subtitle, blocks: afterSubtitle, matched, reason } = extractSubtitle(category, withoutEmpty)
      if (category === 'works') {
        if (matched) subtitleMatched += 1
        else subtitleNonMatches.push({ slug: pair.fr.post_name, reason })
      }

      // Client feedback (task 27): a second, content-based pass drops any
      // other text block that duplicates the extracted subtitle verbatim.
      const deduped = removeSubtitleDuplicateBlocks(afterSubtitle, subtitle)
      subtitleDuplicateBlocksRemoved += afterSubtitle.length - deduped.length

      const coverLegacyId = Number(thumbs.get(pair.fr.ID) || 0) || null
      const withCover = ensureCoverInGallery({ coverLegacyId, blocks: deduped })
      if (withCover !== deduped) coversFoldedIntoGallery += 1

      return {
        legacyWpId: pair.fr.ID,
        category,
        status: 'published',
        enOnly: pair.enOnly,
        slug: { fr: pair.fr.post_name, en: pair.en ? pair.en.post_name : '' },
        title: { fr: base.title, en: en ? en.title : '' },
        subtitle,
        yearLabel: { fr: base.yearLabel, en: en ? en.yearLabel : '' },
        yearStart: base.yearStart,
        yearEnd: base.yearEnd,
        coverLegacyId,
        blocks: withCover,
      }
    })

    console.log(
      `subtitle (works articles): ${subtitleMatched} matched, ${subtitleNonMatches.length} did not` +
      (subtitleNonMatches.length ? ` (${subtitleNonMatches.map((m) => `${m.slug}: ${m.reason}`).join('; ')})` : '')
    )
    console.log(
      `blocks removed: ${emptyTextBlocksRemoved} empty text block(s), ${subtitleDuplicateBlocksRemoved} subtitle-duplicate block(s); ` +
      `${coversFoldedIntoGallery} cover(s) folded into their gallery as a hidden item`
    )

    const enOnlySlugs = articles.filter((a) => a.enOnly).map((a) => a.slug.en || a.slug.fr)
    if (enOnlySlugs.length) {
      console.log(`English-only articles (${enOnlySlugs.length}): ${enOnlySlugs.join(', ')}`)
    }

    const pageRows = await query(`
      SELECT p.ID, p.post_title, p.post_name, t.trid, t.language_code
      FROM {p}posts p
      JOIN {p}icl_translations t ON t.element_id = p.ID AND t.element_type = 'post_page'
      WHERE p.post_type = 'page' AND p.post_status = 'publish'
    `)

    const [{ n: expectedPages }] = await query(
      `SELECT COUNT(*) AS n FROM {p}posts WHERE post_type = 'page' AND post_status = 'publish'`
    )
    assertRowCount(pageRows.length, Number(expectedPages), 'published pages')

    const pageElementor = await metaFor(pageRows.map((r) => r.ID), '_elementor_data')
    const pages = pairByTrid(pageRows).map((pair) => {
      const rawBlocks = mapElementorToBlocks(
        JSON.parse(pageElementor.get(pair.fr.ID) || '[]'),
        JSON.parse((pair.en && !pair.enOnly && pageElementor.get(pair.en.ID)) || 'null'),
        { postId: pair.fr.ID }
      )
      const purged = purgeImageBlocks(rawBlocks, purgedLegacyIds)
      purgedImageBlockCount += rawBlocks.length - purged.length
      const withoutEmpty = removeEmptyTextBlocks(purged)
      emptyTextBlocksRemoved += purged.length - withoutEmpty.length
      return {
        legacyWpId: pair.fr.ID,
        sourceSlug: pair.fr.post_name,
        title: { fr: pair.fr.post_title, en: pair.en ? pair.en.post_title : '' },
        // Task 26, part B3: reduces /contact to just its mailto block. A
        // no-op for every other page (reduceContactPageBlocks returns its
        // input unchanged unless sourceSlug === 'contact').
        blocks: reduceContactPageBlocks(pair.fr.post_name, withoutEmpty),
      }
    })

    if (purgedImageBlockCount) {
      console.log(`purged ${purgedImageBlockCount} icone-oeuvres.jpg image block(s) total (articles + pages)`)
    }

    await writeFile(`${outDir}/articles.json`, JSON.stringify(articles, null, 2))
    await writeFile(`${outDir}/pages.json`, JSON.stringify(pages, null, 2))
    await writeFile(`${outDir}/media.json`, JSON.stringify(media, null, 2))
    return {
      articles: articles.length,
      pages: pages.length,
      media: media.length,
      enOnlySlugs,
      subtitle: { matched: subtitleMatched, nonMatches: subtitleNonMatches },
      purgedImageBlockCount,
      purgedLegacyIds: [...purgedLegacyIds],
      emptyTextBlocksRemoved,
      subtitleDuplicateBlocksRemoved,
      coversFoldedIntoGallery,
    }
  } finally {
    await close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  extractAll().then((counts) => console.log('extracted', counts))
}
