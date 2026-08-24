import { Router } from 'express'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Article } from '#models/Article.js'
import { Page } from '#models/Page.js'
// Registered for its side effect only: `cover` and `blocks.image` populate
// paths on Article/Page both ref 'Image', and nothing else in this router
// loads this model, so without this import mongoose.populate() throws
// MissingSchemaError (an unhandled rejection that hangs the request).
import { Image } from '#models/Image.js'
import { requireAuth, requireCsrfHeader } from '#middleware/auth.js'
import { asyncHandler } from '#middleware/asyncHandler.js'
import { upload } from '#middleware/upload.js'
import { processImage } from '#lib/imagePipeline.js'
import { sanitize, safeUrl } from '#lib/sanitize.js'
import { uniqueSlug } from '#lib/slug.js'
import { localize } from '#lib/localize.js'
import { PAGE_KEYS, RESERVED_SLUGS } from '#lib/constants.js'

const mediaRoot = () => process.env.MEDIA_ROOT || '/data/media'

export const adminRouter = Router()
adminRouter.use(requireAuth)
adminRouter.use((req, res, next) => (req.method === 'GET' ? next() : requireCsrfHeader(req, res, next)))

/**
 * Stored HTML is sanitized on write, everywhere it exists.
 *
 * Two places now, not one. A `text` block's own `value` is the original, and
 * as of task 39 a `references` block's ITEMS each carry a `value` too -- the
 * citation, which is HTML because a book title has to keep its italics. An
 * item's `url` is not HTML at all but still reaches the DOM as an `href`,
 * without sanitize-html's allowedSchemes ever seeing it, so it gets its own
 * check (safeUrl).
 */
function cleanBlocks(blocks = []) {
  return blocks.map((b) => {
    if (b.type === 'text') {
      return { ...b, value: { fr: sanitize(b.value?.fr), en: sanitize(b.value?.en) } }
    }
    if (b.type === 'references') {
      return {
        ...b,
        items: (b.items || []).map((item) => ({
          ...item,
          value: { fr: sanitize(item.value?.fr), en: sanitize(item.value?.en) },
          url: safeUrl(item.url),
        })),
      }
    }
    return b
  })
}

// Task 27, Part A: articles now live at the root (/:slug, /en/:slug), so a
// slug equal to a section segment ("oeuvres", "contact", ...) would shadow
// that section's own route. Checked against both languages, on both create
// and update, since PATCH's ensureSlug() call goes through this same
// function whenever the request body includes a slug at all.
function assertSlugNotReserved(slug) {
  for (const lang of ['fr', 'en']) {
    if (slug[lang] && RESERVED_SLUGS.includes(slug[lang])) {
      const err = new Error(`"${slug[lang]}" is a reserved URL segment and cannot be used as an article slug`)
      err.status = 400
      throw err
    }
  }
}

async function ensureSlug(body, currentId = null) {
  const slug = { ...(body.slug || {}) }
  assertSlugNotReserved(slug)
  if (!slug.fr) {
    const taken = async (s) => {
      const hit = await Article.findOne({ 'slug.fr': s })
      return Boolean(hit) && String(hit._id) !== String(currentId)
    }
    slug.fr = await uniqueSlug(localize(body.title, 'fr') || 'article', taken)
  }
  return slug
}

adminRouter.get('/articles', asyncHandler(async (req, res) => {
  const items = await Article.find().sort({ category: 1, position: 1, yearStart: -1 }).populate('cover').lean()
  res.json({ items, total: items.length })
}))

adminRouter.get('/articles/:id', asyncHandler(async (req, res) => {
  const article = await Article.findById(req.params.id).populate('cover').populate('blocks.image').populate('blocks.items.image').lean()
  if (!article) return res.status(404).json({ error: 'not found' })
  res.json(article)
}))

adminRouter.post('/articles', asyncHandler(async (req, res, next) => {
  try {
    const created = await Article.create({
      ...req.body,
      slug: await ensureSlug(req.body),
      blocks: cleanBlocks(req.body.blocks),
    })
    // Task 30 bug report: this used to return `article.toObject()` straight
    // off the just-created document, with no populate at all -- so `cover`
    // and every block image came back as bare ids, unlike GET and PATCH
    // (both populate below). The client saw the cover "vanish" from the
    // preview immediately after a brand-new article's first save (which
    // goes through this POST, not PATCH) because of exactly that shape
    // mismatch. Re-fetching populated, the same way GET/PATCH already do,
    // is what keeps every response from this router in one consistent shape.
    const article = await Article.findById(created._id)
      .populate('cover')
      .populate('blocks.image')
      .populate('blocks.items.image')
      .lean()
    res.status(201).json(article)
  } catch (err) { next(err) }
}))

adminRouter.patch('/articles/:id', asyncHandler(async (req, res, next) => {
  try {
    const update = { ...req.body }
    if (update.blocks) update.blocks = cleanBlocks(update.blocks)
    if (update.slug) update.slug = await ensureSlug(update, req.params.id)
    // Populated the same way GET /articles/:id is: without this, `.lean()`
    // returns `cover` and the image refs as bare ids, and the client (which
    // reads `article.cover?._id`) silently writes `cover: null` on its next
    // save (task 25, section 0).
    const article = await Article.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .populate('cover')
      .populate('blocks.image')
      .populate('blocks.items.image')
      .lean()
    if (!article) return res.status(404).json({ error: 'not found' })
    res.json(article)
  } catch (err) { next(err) }
}))

adminRouter.delete('/articles/:id', asyncHandler(async (req, res) => {
  const deleted = await Article.findByIdAndDelete(req.params.id)
  if (!deleted) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
}))

adminRouter.post('/articles/reorder', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  await Promise.all(ids.map((id, position) => Article.findByIdAndUpdate(id, { position })))
  res.json({ ok: true })
}))

adminRouter.get('/pages/:key', asyncHandler(async (req, res) => {
  if (!PAGE_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'unknown page' })
  // Same populate calls as GET /articles/:id: without them, every
  // block.image here is a bare id, so PageEditor's thumbnails don't render
  // and its gallery merge (comparing image._id) matches the wrong item.
  // The biography page carries image blocks from the migration, so this
  // affects live content (task 25, section 7).
  const page = (await Page.findOne({ key: req.params.key }).populate('blocks.image').populate('blocks.items.image').lean()) || {
    key: req.params.key,
    blocks: [],
  }
  res.json(page)
}))

adminRouter.patch('/pages/:key', asyncHandler(async (req, res, next) => {
  try {
    const { key } = req.params
    if (!PAGE_KEYS.includes(key)) return res.status(400).json({ error: 'unknown page' })
    const update = { ...req.body, key }
    if (update.blocks) update.blocks = cleanBlocks(update.blocks)
    const page = await Page.findOneAndUpdate({ key }, update, { new: true, upsert: true, runValidators: true }).lean()
    res.json(page)
  } catch (err) { next(err) }
}))

adminRouter.get('/images', asyncHandler(async (req, res) => {
  const items = await Image.find().sort({ createdAt: -1 }).lean()
  res.json({ items, total: items.length })
}))

adminRouter.post('/images', upload.single('file'), asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' })
    const fields = await processImage(req.file.buffer, {
      originalName: req.file.originalname,
      mediaRoot: mediaRoot(),
    })
    const existing = await Image.findOne({ filename: fields.filename })
    if (existing) return res.status(201).json(existing.toObject())
    const image = await Image.create(fields)
    res.status(201).json(image.toObject())
  } catch (err) {
    if (/unsupported image/i.test(err.message)) err.status = 400
    next(err)
  }
}))

adminRouter.patch('/images/:id', asyncHandler(async (req, res, next) => {
  try {
    const image = await Image.findByIdAndUpdate(req.params.id, { alt: req.body?.alt }, { new: true }).lean()
    if (!image) return res.status(404).json({ error: 'not found' })
    res.json(image)
  } catch (err) { next(err) }
}))

adminRouter.delete('/images/:id', asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params
    // Deleting a referenced image would leave holes in the archive, so refuse.
    // Page reuses Article's blockSchema (no `cover` field of its own), so
    // content pages like biography can hold image/gallery blocks too.
    const used =
      (await Article.exists({ $or: [{ cover: id }, { 'blocks.image': id }, { 'blocks.items.image': id }] })) ||
      (await Page.exists({ $or: [{ 'blocks.image': id }, { 'blocks.items.image': id }] }))
    if (used) return res.status(409).json({ error: 'image is in use' })
    const image = await Image.findById(id)
    if (!image) return res.status(404).json({ error: 'not found' })
    await Promise.all(
      Object.values(image.variants || {})
        .filter(Boolean)
        .map((v) => unlink(join(mediaRoot(), v.path)).catch(() => {}))
    )
    await image.deleteOne()
    res.json({ ok: true })
  } catch (err) { next(err) }
}))
