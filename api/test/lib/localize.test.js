import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { localize, resolveDoc } from '../../src/lib/localize.js'

describe('localize', () => {
  it('returns the requested language when present', () => {
    expect(localize({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello')
  })

  it('falls back to French when the English override is empty', () => {
    expect(localize({ fr: 'Châssis-Presse', en: '' }, 'en')).toBe('Châssis-Presse')
    expect(localize({ fr: 'Châssis-Presse' }, 'en')).toBe('Châssis-Presse')
  })

  it('returns an empty string for a missing field', () => {
    expect(localize(undefined, 'fr')).toBe('')
  })
})

describe('resolveDoc', () => {
  it('resolves localized values nested in arrays and objects', () => {
    const doc = {
      title: { fr: 'Œuvres', en: 'Works' },
      blocks: [{ type: 'text', value: { fr: 'Texte', en: '' } }],
      year: 2021,
    }
    expect(resolveDoc(doc, 'en')).toEqual({
      title: 'Works',
      blocks: [{ type: 'text', value: 'Texte' }],
      year: 2021,
    })
  })

  it('leaves non-localized objects alone', () => {
    expect(resolveDoc({ size: { w: 10, h: 20 } }, 'fr')).toEqual({ size: { w: 10, h: 20 } })
  })

  it('passes ObjectId through unchanged', () => {
    const id = new mongoose.Types.ObjectId()
    const original = id.toString()
    const result = resolveDoc({ _id: id }, 'en')
    expect(result._id).toBeInstanceOf(mongoose.Types.ObjectId)
    expect(result._id.toString()).toBe(original)
  })

  it('passes Date through unchanged', () => {
    const date = new Date('2024-01-01')
    const result = resolveDoc({ createdAt: date }, 'en')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt.toString()).toBe(date.toString())
  })

  it('passes null values through as null', () => {
    expect(resolveDoc({ value: null }, 'en')).toEqual({ value: null })
  })

  it('resolves realistic document with ObjectId and Date intact', () => {
    const id = new mongoose.Types.ObjectId()
    const coverId = new mongoose.Types.ObjectId()
    const createdAt = new Date('2024-01-01')
    const idString = id.toString()
    const coverIdString = coverId.toString()

    const doc = {
      _id: id,
      title: { fr: 'Porte', en: '' },
      cover: coverId,
      createdAt: createdAt,
    }
    const result = resolveDoc(doc, 'en')

    expect(result._id).toBeInstanceOf(mongoose.Types.ObjectId)
    expect(result._id.toString()).toBe(idString)
    expect(result.title).toBe('Porte')
    expect(result.cover).toBeInstanceOf(mongoose.Types.ObjectId)
    expect(result.cover.toString()).toBe(coverIdString)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt.toString()).toBe(createdAt.toString())
  })
})
