import { describe, it, expect } from 'vitest'
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
})
