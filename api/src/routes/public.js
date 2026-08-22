import { Router } from 'express'
import { Article } from '../models/Article.js'
import { Page } from '../models/Page.js'
import { Home } from '../models/Home.js'
// Registered for its side effect only: `cover`, `blocks.image`, and `slides.image`
// populate paths on Article/Page/Home all ref 'Image', and nothing else in the
// process loads this model, so without this import mongoose.populate() throws
// MissingSchemaError (an unhandled rejection that hangs the request).
import '../models/Image.js'
import { resolveDoc } from '../lib/localize.js'
import { CATEGORIES, PAGE_KEYS } from '../lib/constants.js'

export const publicRouter = Router()

const langOf = (req) => (req.query.lang === 'en' ? 'en' : 'fr')
const LIST_FIELDS = 'slug title yearLabel yearStart yearEnd category cover position featured'

publicRouter.get('/articles', async (req, res) => {
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
})

publicRouter.get('/articles/:slug', async (req, res) => {
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
})

publicRouter.get('/pages/:key', async (req, res) => {
  const { key } = req.params
  if (!PAGE_KEYS.includes(key)) return res.status(400).json({ error: 'unknown page' })
  const page =
    (await Page.findOne({ key }).populate('blocks.image').populate('blocks.items.image').lean()) ||
    { key, title: { fr: '', en: '' }, blocks: [] }
  res.json(resolveDoc(page, langOf(req)))
})

publicRouter.get('/home', async (req, res) => {
  const lang = langOf(req)
  const home = await Home.findOne({ singleton: 'home' }).populate('slides.image').populate('slides.article').lean()

  // The slideshow IS the featured works. `featured` ("en avant") is the single
  // toggle the editor sets on an article; nothing is curated twice.
  if (!home?.slides?.length) {
    // `cover: { $ne: null }` also excludes documents missing the field entirely
    // (verified against MongoDB). That is deliberate: a slide with no image
    // cannot render, so an imageless featured work is omitted here rather than
    // emitted as a broken slide. Task 21's editor warns when "en avant" is
    // ticked on a work with no cover, which is where that should surface.
    const featured = await Article.find({ status: 'published', featured: true, cover: { $ne: null } })
      .select(LIST_FIELDS)
      .sort({ position: 1, yearStart: -1 })
      .populate('cover')
      .lean()
    const slides = featured.map((a) => ({ image: a.cover, article: a, caption: a.title }))
    return res.json(resolveDoc({ slides }, lang))
  }
  res.json(resolveDoc(home, lang))
})
