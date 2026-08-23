import mongoose from 'mongoose'
import { localizedField } from '#lib/localize.js'
import { PAGE_KEYS } from '#lib/constants.js'
import { blockSchema } from './Article.js'

const pageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PAGE_KEYS, required: true, unique: true },
    title: localizedField(),
    blocks: { type: [blockSchema], default: [] },
    seoDescription: localizedField(),
  },
  { timestamps: true }
)

export const Page = mongoose.model('Page', pageSchema)
