import { describe, it, expect } from 'vitest'
import { countUnsavedChanges } from '../unsavedChanges.js'

const base = () => ({
  title: { fr: 'Porte', en: 'Door' },
  subtitle: { fr: '', en: '' },
  slug: { fr: 'porte', en: 'door' },
  yearLabel: { fr: '2023', en: '2023' },
  yearStart: 2023,
  yearEnd: '',
  status: 'draft',
  cover: { _id: 'img1', filename: 'x.jpg' },
  blocks: [{ type: 'text', value: '<p>a</p>' }],
})

describe('countUnsavedChanges', () => {
  it('is 0 when nothing changed', () => {
    expect(countUnsavedChanges(base(), base())).toBe(0)
  })

  it('is 0 with no saved snapshot yet (nothing to compare against)', () => {
    expect(countUnsavedChanges(base(), null)).toBe(0)
  })

  it('counts a title change (either language) as exactly 1', () => {
    const saved = base()
    const current = { ...base(), title: { fr: 'Châssis', en: 'Door' } }
    expect(countUnsavedChanges(current, saved)).toBe(1)
    const currentBoth = { ...base(), title: { fr: 'Châssis', en: 'Frame' } }
    expect(countUnsavedChanges(currentBoth, saved)).toBe(1)
  })

  it('counts subtitle, slug, status changes as 1 each', () => {
    const saved = base()
    expect(countUnsavedChanges({ ...base(), subtitle: { fr: 'x', en: '' } }, saved)).toBe(1)
    expect(countUnsavedChanges({ ...base(), slug: { fr: 'x', en: 'door' } }, saved)).toBe(1)
    expect(countUnsavedChanges({ ...base(), status: 'published' }, saved)).toBe(1)
  })

  it('groups yearLabel, yearStart and yearEnd under one "year" change', () => {
    const saved = base()
    expect(countUnsavedChanges({ ...base(), yearStart: 2024 }, saved)).toBe(1)
    expect(countUnsavedChanges({ ...base(), yearStart: 2024, yearEnd: 2025, yearLabel: { fr: '2024', en: '2024' } }, saved)).toBe(1)
  })

  it('does not count a cover change when the id is the same but the shape differs (populated object vs bare id)', () => {
    const saved = base()
    const current = { ...base(), cover: 'img1' }
    expect(countUnsavedChanges(current, saved)).toBe(0)
  })

  it('counts a real cover change as 1', () => {
    const saved = base()
    const current = { ...base(), cover: 'img2' }
    expect(countUnsavedChanges(current, saved)).toBe(1)
  })

  it('does not count category at all', () => {
    const saved = base()
    const current = { ...base(), category: 'exhibitions' }
    expect(countUnsavedChanges(current, saved)).toBe(0)
  })

  it('counts a modified block as 1', () => {
    const saved = base()
    const current = { ...base(), blocks: [{ type: 'text', value: '<p>b</p>' }] }
    expect(countUnsavedChanges(current, saved)).toBe(1)
  })

  it('counts an added block as 1', () => {
    const saved = base()
    const current = { ...base(), blocks: [...saved.blocks, { type: 'heading', value: 'H', level: 2 }] }
    expect(countUnsavedChanges(current, saved)).toBe(1)
  })

  it('counts a removed block as 1', () => {
    const saved = { ...base(), blocks: [{ type: 'text', value: '<p>a</p>' }, { type: 'heading', value: 'H', level: 2 }] }
    const current = { ...base(), blocks: [{ type: 'text', value: '<p>a</p>' }] }
    expect(countUnsavedChanges(current, saved)).toBe(1)
  })

  it('sums independent scalar and block changes', () => {
    const saved = base()
    const current = {
      ...base(),
      status: 'published',
      blocks: [{ type: 'text', value: '<p>changed</p>' }],
    }
    expect(countUnsavedChanges(current, saved)).toBe(2)
  })
})
