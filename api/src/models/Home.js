import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'

const homeSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'home', unique: true },
    slides: [
      new mongoose.Schema(
        {
          image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', required: true },
          article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
          caption: localizedField(),
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
)

export const Home = mongoose.model('Home', homeSchema)
