import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withDb } from '../helpers/db.js'
import { Article } from '../../src/models/Article.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)

describe('featured', () => {
  it('defaults to false', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'f1' }, title: { fr: 'A' } })
    expect(a.featured).toBe(false)
  })

  it('is settable and queryable', async () => {
    await Article.create({ category: 'works', slug: { fr: 'f2' }, title: { fr: 'B' }, featured: true })
    const found = await Article.find({ featured: true })
    expect(found.map((a) => a.slug.fr)).toEqual(['f2'])
  })
})

describe('gallery columns', () => {
  it('defaults to three', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 'c1' }, title: { fr: 'C' },
      blocks: [{ type: 'gallery', items: [] }],
    })
    expect(a.blocks[0].columns).toBe(3)
  })

  it('accepts any count from one to six', async () => {
    for (const columns of [1, 2, 3, 4, 5, 6]) {
      const a = await Article.create({
        category: 'works', slug: { fr: `c-${columns}` }, title: { fr: 'C' },
        blocks: [{ type: 'gallery', columns, items: [] }],
      })
      expect(a.blocks[0].columns).toBe(columns)
    }
  })

  it('rejects a count outside one to six', async () => {
    const a = new Article({
      category: 'works', slug: { fr: 'c9' }, title: { fr: 'C' },
      blocks: [{ type: 'gallery', columns: 7, items: [] }],
    })
    await expect(a.validate()).rejects.toThrow(/columns/)
  })
})

describe('gallery item span', () => {
  it('defaults to one column', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 's1' }, title: { fr: 'C' },
      blocks: [{ type: 'gallery', columns: 3, items: [{ caption: { fr: '' } }] }],
    })
    expect(a.blocks[0].items[0].span).toBe(1)
  })

  it('accepts a span wider than two', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 's2' }, title: { fr: 'D' },
      blocks: [{ type: 'gallery', columns: 6, items: [{ span: 4, caption: { fr: '' } }] }],
    })
    expect(a.blocks[0].items[0].span).toBe(4)
  })

  it('rejects a span outside one to six', async () => {
    const a = new Article({
      category: 'works', slug: { fr: 's3' }, title: { fr: 'E' },
      blocks: [{ type: 'gallery', items: [{ span: 7 }] }],
    })
    await expect(a.validate()).rejects.toThrow(/span/)
  })
})
