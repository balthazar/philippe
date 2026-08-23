import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { connect, disconnect } from '../api/src/db.js'
import { Article } from '../api/src/models/Article.js'
import { Page } from '../api/src/models/Page.js'
import { Image } from '../api/src/models/Image.js'
import { CATEGORIES } from '../api/src/lib/constants.js'

export const EXPECTED_ARTICLES = 63
export const EXPECTED_PAGES = 7
const VARIANT_NAMES = ['thumb', 'medium', 'large', 'original']

/** Simple count sanity check: the load must have produced exactly the expected shape. */
export function checkCounts({ articles, pages }) {
  const failures = []
  if (articles !== EXPECTED_ARTICLES) failures.push(`expected ${EXPECTED_ARTICLES} articles, found ${articles}`)
  if (pages !== EXPECTED_PAGES) failures.push(`expected ${EXPECTED_PAGES} pages, found ${pages}`)
  return { failures }
}

/**
 * Per-article structural checks: every article must be publishable (a cover
 * and at least one block) and every slug must be unique within its
 * language. An article with no English slug is expected (one legitimate
 * English-only article in the archive) so it is a warning, not a failure.
 */
export function checkArticles(articles) {
  const failures = []
  const warnings = []
  const seen = { fr: new Set(), en: new Set() }
  for (const a of articles) {
    const name = a.slug?.fr || String(a._id)
    if (!a.cover) failures.push(`article ${name} has no cover`)
    if (!a.blocks?.length) failures.push(`article ${name} has no blocks`)
    if (!a.slug?.en) warnings.push(`article ${name} has no English slug`)
    for (const lang of ['fr', 'en']) {
      const slug = a.slug?.[lang]
      if (!slug) continue
      if (seen[lang].has(slug)) failures.push(`duplicate ${lang} slug: ${slug}`)
      seen[lang].add(slug)
    }
  }
  return { failures, warnings }
}

const PLACEHOLDER_HEADING = 'Ajoutez votre titre ici'
const PURGED_ORIGINAL_FILENAMES = new Set(['icone-oeuvres.jpg'])

/**
 * Task 26, part A2. Fails if any article or page still carries the unfilled
 * Elementor placeholder heading -- confirms the migration's exact-match
 * drop actually ran, rather than trusting the extraction step blindly.
 */
export function checkNoPlaceholderHeadings(articles, pages) {
  const failures = []
  const visit = (blocks, label) => {
    for (const b of blocks || []) {
      if (b.type === 'heading' && (b.value?.fr || '').trim() === PLACEHOLDER_HEADING) {
        failures.push(`${label} still carries the unfilled placeholder heading`)
      }
    }
  }
  for (const a of articles) visit(a.blocks, `article ${a.slug?.fr || a._id}`)
  for (const p of pages) visit(p.blocks, `page ${p.key}`)
  return { failures }
}

/**
 * Task 26, part A3. Fails if any Image document's legacyUrl still ends in a
 * purged filename (icone-oeuvres.jpg) -- confirms the old menu-toggle icon
 * was actually removed from the media library, not just unreferenced.
 */
export function checkNoPurgedImageRefs(images) {
  const failures = []
  for (const img of images) {
    const base = (img.legacyUrl || '').split('/').pop()
    if (PURGED_ORIGINAL_FILENAMES.has(base)) {
      failures.push(`purged image ${base} is still present in the media library as ${img._id}`)
    }
  }
  return { failures }
}

/**
 * Walks every block (image and gallery types) in a list of blocks, calling
 * `visit(imageId, locationLabel)` for each image reference found. Shared
 * between articles and pages, which both use the same block schema.
 */
function walkBlockImages(blocks = [], label, visit) {
  for (const block of blocks) {
    if (block.type === 'image' && block.image != null) visit(block.image, label)
    if (block.type === 'gallery') {
      for (const item of block.items || []) {
        if (item.image != null) visit(item.image, label)
      }
    }
  }
}

/**
 * Confirms that every image ObjectId referenced by an article cover, an
 * image block, or a gallery item (across both articles and pages) actually
 * resolves to an Image document. A migration that dropped an Image record
 * after content was loaded, or that wrote a bad ObjectId, would otherwise
 * surface only as a broken <img> months later; this catches it up front.
 * `imageIds` is a Set of Image document id strings.
 */
export function checkImageRefs({ articles = [], pages = [] }, imageIds) {
  const failures = []
  const visit = (id, label) => {
    const idStr = String(id)
    if (!imageIds.has(idStr)) failures.push(`${label} references missing image ${idStr}`)
  }
  for (const a of articles) {
    const name = a.slug?.fr || String(a._id)
    if (a.cover != null) visit(a.cover, `article ${name} cover`)
    walkBlockImages(a.blocks, `article ${name}`, visit)
  }
  for (const p of pages) {
    walkBlockImages(p.blocks, `page ${p.key}`, visit)
  }
  return { failures }
}

/**
 * For every Image document, confirms its thumb/medium/large/original
 * variants both have path metadata and exist as real files under
 * mediaRoot. A record with metadata but no file on disk is exactly the
 * "content quietly didn't arrive" failure this task exists to catch.
 */
export async function checkImageFiles(images, mediaRoot) {
  const failures = []
  for (const image of images) {
    const name = image.filename || String(image._id)
    for (const variant of VARIANT_NAMES) {
      const v = image.variants?.[variant]
      if (!v?.path) {
        failures.push(`image ${name} missing ${variant} variant metadata`)
        continue
      }
      try {
        await access(join(mediaRoot, v.path))
      } catch {
        failures.push(`image ${name} ${variant} file missing on disk: ${v.path}`)
      }
    }
  }
  return { failures }
}

export async function verify({ mongoUri, dbName = 'philippe', mediaRoot }) {
  await connect(mongoUri, dbName)
  try {
    const [articles, pages, images] = await Promise.all([
      Article.find().lean(),
      Page.find().lean(),
      Image.find().lean(),
    ])

    const failures = []
    const warnings = []

    failures.push(...checkCounts({ articles: articles.length, pages: pages.length }).failures)

    const articleCheck = checkArticles(articles)
    failures.push(...articleCheck.failures)
    warnings.push(...articleCheck.warnings)

    const imageIds = new Set(images.map((img) => String(img._id)))
    failures.push(...checkImageRefs({ articles, pages }, imageIds).failures)

    const fileCheck = await checkImageFiles(images, mediaRoot)
    failures.push(...fileCheck.failures)

    failures.push(...checkNoPlaceholderHeadings(articles, pages).failures)
    failures.push(...checkNoPurgedImageRefs(images).failures)

    // Coverage note, not a failure: a works article that legitimately has
    // prose (not a technique line) as its first block is expected to have
    // no subtitle -- see extractSubtitle's non-matching path in extract.js.
    const worksWithoutSubtitle = articles
      .filter((a) => a.category === 'works' && !(a.subtitle?.fr || '').trim())
      .map((a) => a.slug?.fr || String(a._id))
    if (worksWithoutSubtitle.length) {
      warnings.push(`works article(s) with no subtitle: ${worksWithoutSubtitle.join(', ')}`)
    }

    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
    for (const a of articles) {
      if (a.category in byCategory) byCategory[a.category] += 1
      else byCategory[a.category] = (byCategory[a.category] || 0) + 1
    }

    const report = {
      articles: articles.length,
      pages: pages.length,
      images: images.length,
      byCategory,
      worksWithSubtitle: articles.filter((a) => a.category === 'works').length - worksWithoutSubtitle.length,
    }

    return { ok: failures.length === 0, failures, warnings, report }
  } finally {
    await disconnect()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verify({
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27018',
    dbName: process.env.MONGO_DB || 'philippe',
    mediaRoot: process.env.MEDIA_ROOT || '/tmp/philippe-media',
  }).then((r) => {
    console.log(JSON.stringify(r.report, null, 2))
    r.warnings.forEach((w) => console.warn('warning:', w))
    r.failures.forEach((f) => console.error('FAIL:', f))
    process.exit(r.ok ? 0 : 1)
  })
}
