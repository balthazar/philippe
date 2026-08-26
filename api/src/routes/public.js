import { Router } from 'express'
import { Article } from '#models/Article.js'
import { Page } from '#models/Page.js'
// Imported for two reasons now. The side effect came first: `cover` and
// `blocks.image` on Article/Page both ref 'Image', and nothing else in the
// process loads this model, so without this import mongoose.populate() throws
// MissingSchemaError (an unhandled rejection that hangs the request). The
// binding itself is used by the thumbnail lookup in /articles below.
import { Image } from '../models/Image.js'
import { resolveDoc } from '#lib/localize.js'
import { CATEGORIES, PAGE_KEYS } from '#lib/constants.js'
import { asyncHandler } from '#middleware/asyncHandler.js'

export const publicRouter = Router()

const langOf = (req) => (req.query.lang === 'en' ? 'en' : 'fr')
const LIST_FIELDS = 'slug title yearLabel yearStart yearEnd category cover position'

/*
 * The image refs a `thumb` can be derived from, and NOTHING else off `blocks`.
 * MongoDB projects sub-fields of an array, so this pulls the handful of
 * ObjectIds each article's blocks point at without dragging along their
 * sanitized body HTML -- which, over the 40 exhibitions this list holds, is
 * most of the site's prose and would land in a response the timeline rail
 * refetches on every language switch.
 */
const THUMB_FIELDS = 'blocks.type blocks.image blocks.items.image blocks.items.hidden'

/**
 * The id of the first image an article's own body shows -- the DEFAULT
 * thumbnail, used when the article has no cover of its own.
 *
 * The default exists because no exhibition has a cover: zero of the forty in
 * the archive, since the WordPress import that produced them had nothing to
 * map one from and nothing since has needed one. `cover` is the works
 * section's field -- it is what the homepage slideshow draws from and what the
 * works grid renders -- and setting it forty more times by hand, on articles
 * where it would never be seen anywhere else, is data entry standing in for a
 * default. An exhibition already leads with a photograph of the show; that
 * photograph is the thumbnail. A cover set in the admin still wins, here and
 * everywhere else -- this only fills the gap where there is none.
 *
 * Hidden gallery items are skipped, for the same reason BlockRenderer filters
 * them out of the grid and the lightbox: an image marked hidden is in the
 * data deliberately (often as a cover candidate) and must not surface in a
 * place the artist did not put it.
 *
 * Deliberately does NOT consider `article.cover`: by the time this is called
 * that field is populated, so it holds the image document itself rather than
 * an id, and an id is the only thing the caller's batch lookup can use. An
 * earlier version returned it anyway, which stringified a document to
 * "[object Object]", handed that to `$in`, and turned every request for a
 * list containing even one covered article into a CastError.
 */
function bodyImageIdOf(article) {
  for (const block of article.blocks || []) {
    if (block.image) return block.image
    const item = (block.items || []).find((i) => i.image && !i.hidden)
    if (item) return item.image
  }
  return null
}

publicRouter.get('/articles', asyncHandler(async (req, res) => {
  const lang = langOf(req)
  const { category } = req.query
  if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: 'unknown category' })

  const query = { status: 'published', ...(category ? { category } : {}) }
  const items = await Article.find(query)
    .select(`${LIST_FIELDS} ${THUMB_FIELDS}`)
    .sort({ position: 1, yearStart: -1, createdAt: -1 })
    .populate('cover')
    .lean()

  // One query for every default thumbnail in the list, rather than
  // `.populate()` on the block paths: populating would fetch EVERY image every
  // block points at -- roughly thirteen per exhibition, five hundred across
  // the section -- and then throw all but the first of each away. Only the ids
  // actually needed are looked up, and only for the articles that have no
  // cover to use instead, so this costs one round trip and at most one image
  // document per uncovered article.
  //
  // `cover` itself is left exactly as it was, populated and unchanged: `thumb`
  // is a second, derived field, not a redefinition of the stored one. That
  // keeps one key meaning one thing -- `cover` is what the artist chose, in
  // the admin and in the API alike -- and it is why the works grid, which
  // reads `cover`, cannot shift under this change.
  const bodyIds = items.map((a) => (a.cover ? null : bodyImageIdOf(a)))
  const needed = [...new Set(bodyIds.filter(Boolean).map(String))]
  const images = needed.length ? await Image.find({ _id: { $in: needed } }).lean() : []
  const byId = new Map(images.map((img) => [String(img._id), img]))

  res.json({
    items: items.map((a, i) => {
      // `blocks` was selected only to find the id above -- it is not part of
      // this endpoint's shape and must not leak into one.
      const { blocks, ...rest } = a
      const thumb = a.cover || (bodyIds[i] ? byId.get(String(bodyIds[i])) || null : null)
      return { ...resolveDoc(rest, lang), thumb: thumb ? resolveDoc(thumb, lang) : null }
    }),
    total: items.length,
  })
}))

publicRouter.get('/articles/:slug', asyncHandler(async (req, res) => {
  const lang = langOf(req)
  const { slug } = req.params
  const article = await Article.findOne({
    status: 'published',
    $or: [{ 'slug.fr': slug }, { 'slug.en': slug }],
  })
    .populate('cover')
    .populate('blocks.image')
    .populate('blocks.items.image')
    .lean()
  if (!article) return res.status(404).json({ error: 'not found' })

  const siblings = await Article.find({ status: 'published', category: article.category })
    .select(LIST_FIELDS)
    .sort({ position: 1, yearStart: -1, createdAt: -1 })
    .lean()
  const i = siblings.findIndex((s) => String(s._id) === String(article._id))

  res.json({
    ...resolveDoc(article, lang),
    prev: i > 0 ? resolveDoc(siblings[i - 1], lang) : null,
    next: i >= 0 && i < siblings.length - 1 ? resolveDoc(siblings[i + 1], lang) : null,
  })
}))

publicRouter.get('/pages/:key', asyncHandler(async (req, res) => {
  const { key } = req.params
  if (!PAGE_KEYS.includes(key)) return res.status(400).json({ error: 'unknown page' })
  const page =
    (await Page.findOne({ key }).populate('blocks.image').populate('blocks.items.image').lean()) ||
    { key, title: { fr: '', en: '' }, blocks: [] }
  res.json(resolveDoc(page, langOf(req)))
}))

publicRouter.get('/home', asyncHandler(async (req, res) => {
  const lang = langOf(req)

  // Task 30, part 2: reinstates the curation flag (see the amended bullet in
  // docs/superpowers/plans/2026-08-22-philippe-gronon-site.md). The artist
  // hand-picks the slideshow by toggling `featured` on works articles and
  // ordering it via the article list's existing drag-to-reorder `position`
  // -- there is no second ordering mechanism.
  //
  // `cover: { $ne: null }` also excludes documents missing the field entirely
  // (verified against MongoDB). That is deliberate: a slide with no image cannot
  // render, so a work without a cover is omitted rather than emitted as a broken
  // slide.
  //
  // Deliberately UNBOUNDED. This query used to end in `.limit(8)`, which
  // meant the artist could star a ninth work and watch nothing happen: the
  // toggle saved, the admin showed it starred, and the homepage silently
  // dropped it. (Thirteen were starred by the time this was noticed, so five
  // were being discarded.) `featured` is a hand-curated flag on a single
  // artist's own works -- the list is as long as he decides it is, and a cap
  // here can only ever contradict a choice he already made in the admin.
  // The FALLBACK below keeps its limit, for the opposite reason: see there.
  let slideArticles = await Article.find({ status: 'published', category: 'works', featured: true, cover: { $ne: null } })
    .select(LIST_FIELDS)
    .sort({ position: 1 })
    .populate('cover')
    .lean()

  // Fallback: nothing is featured yet (or every featured work has since lost
  // its cover), so fall back to the most recent published works. Without
  // this the slideshow goes blank the instant this ships and stays blank
  // until someone toggles something.
  //
  // This one KEEPS its limit of 8, unlike the curated query above: nobody
  // chose these slides, a date sort did, and "show every published work with
  // a cover" (34 today) is a machine's guess about the homepage rather than
  // the artist's decision about it. Starring anything at all replaces this
  // list wholesale, cap included.
  if (!slideArticles.length) {
    slideArticles = await Article.find({ status: 'published', category: 'works', cover: { $ne: null } })
      .select(LIST_FIELDS)
      .sort({ yearStart: -1, createdAt: -1 })
      .limit(8)
      .populate('cover')
      .lean()
  }

  const slides = slideArticles.map((a) => ({ image: a.cover, article: a, caption: a.title }))
  res.json(resolveDoc({ slides }, lang))
}))
