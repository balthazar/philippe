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

    const media = attachments
      .filter((a) => String(a.post_mime_type).startsWith('image/'))
      .map((a) => ({ legacyWpId: a.ID, file: a.file, mime: a.post_mime_type, originalName: a.file.split('/').pop() }))

    const articles = pairByTrid(postRows).map((pair) => {
      const base = parseYearLabel(pair.fr.post_title)
      const en = pair.en && !pair.enOnly ? parseYearLabel(pair.en.post_title) : null
      return {
        legacyWpId: pair.fr.ID,
        category: mapCategory(pair.fr.category_name),
        status: 'published',
        enOnly: pair.enOnly,
        slug: { fr: pair.fr.post_name, en: pair.en ? pair.en.post_name : '' },
        title: { fr: base.title, en: en ? en.title : '' },
        yearLabel: { fr: base.yearLabel, en: en ? en.yearLabel : '' },
        yearStart: base.yearStart,
        yearEnd: base.yearEnd,
        coverLegacyId: Number(thumbs.get(pair.fr.ID) || 0) || null,
        blocks: mapElementorToBlocks(
          JSON.parse(elementor.get(pair.fr.ID) || '[]'),
          JSON.parse((pair.en && !pair.enOnly && elementor.get(pair.en.ID)) || 'null'),
          { postId: pair.fr.ID }
        ),
      }
    })

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
    const pages = pairByTrid(pageRows).map((pair) => ({
      legacyWpId: pair.fr.ID,
      sourceSlug: pair.fr.post_name,
      title: { fr: pair.fr.post_title, en: pair.en ? pair.en.post_title : '' },
      blocks: mapElementorToBlocks(
        JSON.parse(pageElementor.get(pair.fr.ID) || '[]'),
        JSON.parse((pair.en && !pair.enOnly && pageElementor.get(pair.en.ID)) || 'null'),
        { postId: pair.fr.ID }
      ),
    }))

    await writeFile(`${outDir}/articles.json`, JSON.stringify(articles, null, 2))
    await writeFile(`${outDir}/pages.json`, JSON.stringify(pages, null, 2))
    await writeFile(`${outDir}/media.json`, JSON.stringify(media, null, 2))
    return { articles: articles.length, pages: pages.length, media: media.length, enOnlySlugs }
  } finally {
    await close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  extractAll().then((counts) => console.log('extracted', counts))
}
