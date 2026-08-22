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

  it('accepts the five block types', async () => {
    const a = await Article.create({
      category: 'works',
      slug: { fr: 'blocks' },
      title: { fr: 'A' },
      blocks: [
        { type: 'text', value: { fr: '<p>Bonjour</p>' } },
        { type: 'heading', value: { fr: 'Titre' }, level: 2 },
        { type: 'specs', items: [{ term: { fr: 'Tirage' }, value: { fr: '3' } }] },
      ],
    })
    expect(a.blocks).toHaveLength(3)
  })
})
