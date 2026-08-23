import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withDb } from '../helpers/db.js'
import { Article } from '../../src/models/Article.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)

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

// Task 30, part 4: a gallery block's display mode -- grid (today's
// behaviour) or slider, one image at a time on the public page.
describe('gallery mode', () => {
  it('defaults to grid', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 'm1' }, title: { fr: 'M' },
      blocks: [{ type: 'gallery', items: [] }],
    })
    expect(a.blocks[0].mode).toBe('grid')
  })

  it('accepts slider', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 'm2' }, title: { fr: 'M2' },
      blocks: [{ type: 'gallery', mode: 'slider', items: [] }],
    })
    expect(a.blocks[0].mode).toBe('slider')
  })

  it('rejects an unknown mode', async () => {
    const a = new Article({
      category: 'works', slug: { fr: 'm3' }, title: { fr: 'M3' },
      blocks: [{ type: 'gallery', mode: 'carousel', items: [] }],
    })
    await expect(a.validate()).rejects.toThrow(/mode/)
  })
})

// Task 30, part 2: reinstates the curation flag the plan's Global Constraints
// once documented as removed (see the amended bullet in
// docs/superpowers/plans/2026-08-22-philippe-gronon-site.md) -- the client
// asked for it back so the artist can hand-pick the homepage slideshow.
describe('featured', () => {
  it('defaults to false', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'f1' }, title: { fr: 'F' } })
    expect(a.featured).toBe(false)
  })

  it('is settable and queryable', async () => {
    await Article.create({ category: 'works', slug: { fr: 'f2' }, title: { fr: 'F2' }, featured: true })
    const found = await Article.findOne({ featured: true })
    expect(found.slug.fr).toBe('f2')
  })
})
