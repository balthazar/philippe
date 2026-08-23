import { Router } from 'express'
import { Article } from '#models/Article.js'
import { Page } from '#models/Page.js'
// Registered for its side effect only: `cover` and `blocks.image` populate
// paths on Article/Page both ref 'Image', and nothing else in the process
// loads this model, so without this import mongoose.populate() throws
// MissingSchemaError (an unhandled rejection that hangs the request).
import '../models/Image.js'
import { resolveDoc } from '#lib/localize.js'
import { CATEGORIES, PAGE_KEYS } from '#lib/constants.js'
import { asyncHandler } from '#middleware/asyncHandler.js'

export const publicRouter = Router()

const langOf = (req) => (req.query.lang === 'en' ? 'en' : 'fr')
const LIST_FIELDS = 'slug title yearLabel yearStart yearEnd category cover position'

publicRouter.get('/articles', asyncHandler(async (req, res) => {
  const lang = langOf(req)
  const { category } = req.query
  if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: 'unknown category' })

  const query = { status: 'published', ...(category ? { category } : {}) }
  const items = await Article.find(query)
    .select(LIST_FIELDS)
    .sort({ position: 1, yearStart: -1, createdAt: -1 })
    .populate('cover')
    .lean()

  res.json({ items: items.map((a) => resolveDoc(a, lang)), total: items.length })
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

  // The slideshow is simply the most recent works. There is no curation flag:
  // each work has one image, its cover, and that same image serves both the
  // archive grid and the slideshow, so nothing is chosen twice.
  //
  // `cover: { $ne: null }` also excludes documents missing the field entirely
  // (verified against MongoDB). That is deliberate: a slide with no image cannot
  // render, so a work without a cover is omitted rather than emitted as a broken
  // slide.
  const recent = await Article.find({ status: 'published', category: 'works', cover: { $ne: null } })
    .select(LIST_FIELDS)
    .sort({ yearStart: -1, createdAt: -1 })
    .limit(8)
    .populate('cover')
    .lean()

  const slides = recent.map((a) => ({ image: a.cover, article: a, caption: a.title }))
  res.json(resolveDoc({ slides }, lang))
}))
