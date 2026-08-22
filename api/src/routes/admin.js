import { Router } from 'express'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Article } from '../models/Article.js'
import { Page } from '../models/Page.js'
// Registered for its side effect only: `cover` and `blocks.image` populate
// paths on Article/Page both ref 'Image', and nothing else in this router
// loads this model, so without this import mongoose.populate() throws
// MissingSchemaError (an unhandled rejection that hangs the request).
import { Image } from '../models/Image.js'
import { requireAuth, requireCsrfHeader } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { upload } from '../middleware/upload.js'
import { processImage } from '../lib/imagePipeline.js'
import { sanitize } from '../lib/sanitize.js'
import { uniqueSlug } from '../lib/slug.js'
import { localize } from '../lib/localize.js'
import { PAGE_KEYS } from '../lib/constants.js'

const mediaRoot = () => process.env.MEDIA_ROOT || '/data/media'

export const adminRouter = Router()
adminRouter.use(requireAuth)
adminRouter.use((req, res, next) => (req.method === 'GET' ? next() : requireCsrfHeader(req, res, next)))

/** Text blocks are the only place stored HTML exists, so sanitize on write. */
function cleanBlocks(blocks = []) {
  return blocks.map((b) =>
    b.type === 'text'
      ? { ...b, value: { fr: sanitize(b.value?.fr), en: sanitize(b.value?.en) } }
      : b
  )
}

async function ensureSlug(body, currentId = null) {
  const slug = { ...(body.slug || {}) }
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
    const article = await Article.create({
      ...req.body,
      slug: await ensureSlug(req.body),
      blocks: cleanBlocks(req.body.blocks),
    })
    res.status(201).json(article.toObject())
  } catch (err) { next(err) }
}))

adminRouter.patch('/articles/:id', asyncHandler(async (req, res, next) => {
  try {
    const update = { ...req.body }
    if (update.blocks) update.blocks = cleanBlocks(update.blocks)
    if (update.slug) update.slug = await ensureSlug(update, req.params.id)
    const article = await Article.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).lean()
    if (!article) return res.status(404).json({ error: 'not found' })
    res.json(article)
  } catch (err) { next(err) }
}))

adminRouter.delete('/articles/:id', asyncHandler(async (req, res) => {
  await Article.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}))

adminRouter.post('/articles/reorder', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  await Promise.all(ids.map((id, position) => Article.findByIdAndUpdate(id, { position })))
  res.json({ ok: true })
}))

adminRouter.get('/pages/:key', asyncHandler(async (req, res) => {
  if (!PAGE_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'unknown page' })
  const page = (await Page.findOne({ key: req.params.key }).lean()) || { key: req.params.key, blocks: [] }
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
