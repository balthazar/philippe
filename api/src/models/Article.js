import mongoose from 'mongoose'
import { localizedField } from '#lib/localize.js'
import { CATEGORIES, BLOCK_TYPES } from '#lib/constants.js'

const blockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: BLOCK_TYPES, required: true },
    value: localizedField(),                                   // text
    // Task 30, part 5: `heading` is retired as a block type -- what used to
    // be a heading is now a real <h2>/<h3> inside a `text` block's own
    // sanitized HTML. `level` is vestigial (no writer sets it any more) but
    // left in the schema rather than a destructive migration of every
    // historical document that once carried one.
    level: { type: Number, enum: [2, 3], default: 2 },         // (vestigial, formerly heading)
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
          // Task 27, client feedback item 1: a gallery item can be present in
          // the data (so it can also serve as the article's `cover`) without
          // showing in the public grid or lightbox. Defaults false so every
          // pre-existing item stays visible.
          hidden: { type: Boolean, default: false },              // gallery item
        },
        { _id: false }
      ),
    ],
    columns: { type: Number, min: 1, max: 6, default: 3 },
    // Task 30, part 4: display mode for a gallery block. `columns` is
    // meaningless in slider mode (one image at a time), so the admin hides
    // that control there rather than leaving one that does nothing.
    mode: { type: String, enum: ['grid', 'slider'], default: 'grid' },
  },
  { _id: false }
)

const articleSchema = new mongoose.Schema(
  {
    slug: localizedField(),
    category: { type: String, enum: CATEGORIES, required: true },
    title: localizedField(),
    // The technique/materials line (task 26, part A1): structural metadata,
    // not a content block. Same localization rule as every other field:
    // `fr` is the base, `en` an optional override, read as
    // `field[lang] || field.fr`. Plain text only, same rule as `yearLabel`
    // and every heading/specs value -- never rendered through
    // dangerouslySetInnerHTML.
    subtitle: localizedField(),
    yearLabel: localizedField(),
    yearStart: Number,
    yearEnd: Number,
    cover: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' },
    blocks: [blockSchema],
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    // Task 30, part 2: reinstates the curation flag an earlier task removed
    // (see the amended bullet in
    // docs/superpowers/plans/2026-08-22-philippe-gronon-site.md). Works only:
    // the admin toggle only ever renders for the `works` category (checked
    // client-side, ArticleList.jsx), and GET /home only ever queries it
    // against `category: 'works'`, so a `featured` value on a non-works
    // article is simply never read by anything.
    featured: { type: Boolean, default: false },
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
// Supports GET /home's featured query, sorted by the article list's own
// manual order (`position`) -- there is no second ordering mechanism.
articleSchema.index({ category: 1, status: 1, featured: 1, position: 1 })

// Exported so Page can reuse the same block shape without reaching into
// Article's schema internals. Sharing a sub-schema across models is supported.
export { blockSchema }
export const Article = mongoose.model('Article', articleSchema)
