import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withDb } from '../helpers/db.js'
import { Article } from '../../src/models/Article.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)

describe('Article', () => {
  it('rejects an unknown category', async () => {
    const a = new Article({ category: 'sculpture', slug: { fr: 'x' }, title: { fr: 'X' } })
    await expect(a.validate()).rejects.toThrow(/category/)
  })

  it('rejects a duplicate French slug', async () => {
    await Article.create({ category: 'works', slug: { fr: 'dupe' }, title: { fr: 'A' } })
    await expect(
      Article.create({ category: 'works', slug: { fr: 'dupe' }, title: { fr: 'B' } })
    ).rejects.toThrow(/duplicate key/)
  })

  it('defaults to draft status', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'd1' }, title: { fr: 'A' } })
    expect(a.status).toBe('draft')
  })

  // Task 30, part 5: `heading` is retired. What used to be a heading is now
  // a `text` block carrying an <h2>/<h3> directly in its sanitized HTML.
  it('accepts the four block types', async () => {
    const a = await Article.create({
      category: 'works',
      slug: { fr: 'blocks' },
      title: { fr: 'A' },
      blocks: [
        { type: 'text', value: { fr: '<h2>Titre</h2><p>Bonjour</p>' } },
        { type: 'specs', items: [{ term: { fr: 'Tirage' }, value: { fr: '3' } }] },
      ],
    })
    expect(a.blocks).toHaveLength(2)
  })

  it('rejects the retired heading block type', async () => {
    const a = new Article({
      category: 'works',
      slug: { fr: 'old-heading' },
      title: { fr: 'A' },
      blocks: [{ type: 'heading', value: { fr: 'Titre' }, level: 2 }],
    })
    await expect(a.validate()).rejects.toThrow(/type/)
  })
})
