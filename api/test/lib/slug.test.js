import { describe, it, expect } from 'vitest'
import { slugify, uniqueSlug } from '../../src/lib/slug.js'

describe('slugify', () => {
  it('lowercases and strips accents', () => {
    expect(slugify('Châssis-Presse')).toBe('chassis-presse')
    expect(slugify('Œuvres récentes')).toBe('oeuvres-recentes')
  })

  it('collapses punctuation and spaces into single hyphens', () => {
    expect(slugify('Nouveau | 2024')).toBe('nouveau-2024')
  })
})

describe('uniqueSlug', () => {
  it('appends a counter until the slug is free', async () => {
    const taken = new Set(['essai', 'essai-2'])
    expect(await uniqueSlug('Essai', async (s) => taken.has(s))).toBe('essai-3')
  })
})
