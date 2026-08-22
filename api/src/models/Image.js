import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'

const variantSchema = new mongoose.Schema(
  { path: String, width: Number, height: Number, bytes: Number },
  { _id: false }
)

const imageSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true },
    originalName: String,
    mime: String,
    width: Number,
    height: Number,
    bytes: Number,
    alt: localizedField(),
    variants: {
      thumb: variantSchema,
      medium: variantSchema,
      large: variantSchema,
      original: variantSchema,
    },
    legacyWpId: Number,
    legacyUrl: String,
  },
  { timestamps: true }
)

imageSchema.index({ legacyWpId: 1 }, { unique: true, sparse: true })

export const Image = mongoose.model('Image', imageSchema)
