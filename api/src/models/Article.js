import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'
import { CATEGORIES, BLOCK_TYPES } from '../lib/constants.js'

const blockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: BLOCK_TYPES, required: true },
    value: localizedField(),                                   // text, heading
    level: { type: Number, enum: [2, 3], default: 2 },         // heading
    image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }, // image
    caption: localizedField(),                                 // image
    size: { type: String, enum: ['full', 'wide', 'inset'], default: 'wide' },
    items: [
      new mongoose.Schema(
        {
          image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }, // gallery
          caption: localizedField(),
          term: localizedField(),                              // specs
          value: localizedField(),
          span: { type: Number, min: 1, max: 6, default: 1 },      // gallery item width
        },
        { _id: false }
      ),
    ],
    columns: { type: Number, min: 1, max: 6, default: 3 },
  },
  { _id: false }
)

const articleSchema = new mongoose.Schema(
  {
    slug: localizedField(),
    category: { type: String, enum: CATEGORIES, required: true },
    title: localizedField(),
    yearLabel: localizedField(),
    yearStart: Number,
    yearEnd: Number,
    cover: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' },
    blocks: [blockSchema],
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    position: { type: Number, default: 0 },
    seoDescription: localizedField(),
    legacyWpId: Number,
  },
  { timestamps: true }
)

// A sparse index skips only missing/null values, but localizedField() defaults
// both languages to '', so every article without an English slug would collide
// with every other one. Partial indexes on non-empty strings are what we want.
articleSchema.index({ 'slug.fr': 1 }, { unique: true, partialFilterExpression: { 'slug.fr': { $gt: '' } } })
articleSchema.index({ 'slug.en': 1 }, { unique: true, partialFilterExpression: { 'slug.en': { $gt: '' } } })
articleSchema.index({ category: 1, status: 1, yearStart: -1 })
articleSchema.index({ legacyWpId: 1 }, { unique: true, sparse: true })

// Exported so Page can reuse the same block shape without reaching into
// Article's schema internals. Sharing a sub-schema across models is supported.
export { blockSchema }
export const Article = mongoose.model('Article', articleSchema)
