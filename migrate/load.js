import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connect, disconnect } from '../api/src/db.js'
import { Article } from '../api/src/models/Article.js'
import { Page } from '../api/src/models/Page.js'
import { Image } from '../api/src/models/Image.js'
import { processImage } from '../api/src/lib/imagePipeline.js'
import { PAGE_KEYS } from '../api/src/lib/constants.js'

/** WordPress page slugs to our page keys. Unlisted slugs are skipped (with a warning). */
const PAGE_KEY_BY_SLUG = {
  accueil: 'home', home: 'home',
  oeuvres: 'works', works: 'works',
  biographie: 'biography', biography: 'biography',
  contact: 'contact',
  bibliographie: 'bibliography', bibliography: 'bibliography',
  liens: 'links', links: 'links',
  'mentions-legales': 'legal', 'terms-and-conditions': 'legal',
}

/**
 * Replaces `{ legacyWpId }` placeholders inside image/gallery blocks with the
 * real Mongo ObjectId, using the map built while importing media. A legacy id
 * that never resolved to an imported image (file missing, or genuinely never
 * imported) means the block is dropped entirely: a missing file must never
 * become a dangling reference in the loaded content.
 */
export function resolveBlockImages(blocks = [], byLegacyId) {
  const out = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const id = byLegacyId.get(block.image?.legacyWpId)
      if (id) out.push({ ...block, image: id })
      continue // a missing file means no block, never a dangling reference
    }
    if (block.type === 'gallery') {
      const items = (block.items || [])
        .map((i) => ({ ...i, image: byLegacyId.get(i.image?.legacyWpId) }))
        .filter((i) => i.image)
      if (items.length) out.push({ ...block, items })
      continue
    }
    out.push(block)
  }
  return out
}

/**
 * The set of legacy media ids actually used by an article cover, an image
 * block or a gallery item, across both articles and pages. Of the 1282
 * extracted media entries, only ~487 are referenced; the rest are theme SVG
 * icons, WooCommerce placeholders and dead uploads that the artist never
 * chose to publish, and importing them would triple the number of sharp
 * operations for no benefit.
 */
export function collectReferencedIds(articles = [], pages = []) {
  const ids = new Set()
  const addBlocks = (blocks = []) => {
    for (const block of blocks) {
      if (block.type === 'image' && block.image?.legacyWpId) ids.add(block.image.legacyWpId)
      if (block.type === 'gallery') {
        for (const item of block.items || []) {
          if (item.image?.legacyWpId) ids.add(item.image.legacyWpId)
        }
      }
    }
  }
  for (const article of articles) {
    if (article.coverLegacyId) ids.add(article.coverLegacyId)
    addBlocks(article.blocks)
  }
  for (const page of pages) addBlocks(page.blocks)
  return ids
}

export async function loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri, dbName }) {
  await connect(mongoUri, dbName)
  try {
    const read = async (name) => JSON.parse(await readFile(join(dataDir, name), 'utf8'))
    const [articles, pages, media] = await Promise.all([
      read('articles.json'),
      read('pages.json'),
      read('media.json'),
    ])

    const importAll = process.env.MIGRATE_ALL_MEDIA === '1'
    const referenced = collectReferencedIds(articles, pages)

    const byLegacyId = new Map()
    let imported = 0
    let skippedUnreferenced = 0
    let skippedMissingFile = 0
    let dedupedByContent = 0

    for (const item of media) {
      if (!importAll && !referenced.has(item.legacyWpId)) {
        skippedUnreferenced += 1
        continue
      }
      const existing = await Image.findOne({ legacyWpId: item.legacyWpId })
      if (existing) {
        byLegacyId.set(item.legacyWpId, existing._id)
        imported += 1
        continue
      }
      let buffer
      try {
        buffer = await readFile(join(uploadsRoot, item.file))
      } catch {
        console.warn(`missing upload, skipped: ${item.file}`)
        skippedMissingFile += 1
        continue
      }
      const fields = await processImage(buffer, { originalName: item.originalName, mediaRoot })
      // WordPress sometimes registers the same physical upload under two
      // distinct attachment ids (e.g. a post duplicated the media library
      // entry rather than the file). `Image.filename` is a content hash and
      // carries a unique index, so a second legacyWpId with byte-identical
      // content must reuse that existing document rather than attempt a
      // second insert, which would throw E11000 on `filename_1`.
      const byContent = await Image.findOne({ filename: fields.filename })
      if (byContent) {
        byLegacyId.set(item.legacyWpId, byContent._id)
        imported += 1
        dedupedByContent += 1
        continue
      }
      const doc = await Image.findOneAndUpdate(
        { legacyWpId: item.legacyWpId },
        { ...fields, legacyWpId: item.legacyWpId, legacyUrl: `/wp-content/uploads/${item.file}` },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      byLegacyId.set(item.legacyWpId, doc._id)
      imported += 1
    }
    console.log(
      `media: imported ${imported} (${dedupedByContent} deduped by content), skipped as unreferenced ${skippedUnreferenced}, skipped (file missing) ${skippedMissingFile}`
    )

    for (const article of articles) {
      await Article.findOneAndUpdate(
        { legacyWpId: article.legacyWpId },
        {
          category: article.category,
          status: article.status,
          slug: article.slug,
          title: article.title,
          yearLabel: article.yearLabel,
          yearStart: article.yearStart,
          yearEnd: article.yearEnd,
          cover: byLegacyId.get(article.coverLegacyId) || null,
          blocks: resolveBlockImages(article.blocks, byLegacyId),
          legacyWpId: article.legacyWpId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      )
    }

    let pageCount = 0
    for (const page of pages) {
      const key = PAGE_KEY_BY_SLUG[page.sourceSlug]
      if (!key || !PAGE_KEYS.includes(key)) {
        console.warn(`unmapped page slug, skipped: ${page.sourceSlug}`)
        continue
      }
      await Page.findOneAndUpdate(
        { key },
        { key, title: page.title, blocks: resolveBlockImages(page.blocks, byLegacyId) },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      )
      pageCount += 1
    }

    return {
      images: imported,
      imagesDedupedByContent: dedupedByContent,
      imagesSkippedUnreferenced: skippedUnreferenced,
      imagesSkippedMissingFile: skippedMissingFile,
      articles: articles.length,
      pages: pageCount,
    }
  } finally {
    await disconnect()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now()
  loadAll({
    dataDir: new URL('./data/', import.meta.url).pathname,
    uploadsRoot: process.env.UPLOADS_ROOT || new URL('./uploads/', import.meta.url).pathname,
    mediaRoot: process.env.MEDIA_ROOT || '/tmp/philippe-media',
    mongoUri: process.env.MONGO_URI,
    dbName: process.env.MONGO_DB,
  }).then((counts) => {
    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)
    console.log('loaded', counts, `in ${elapsedSec}s`)
  })
}
