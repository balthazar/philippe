import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { withDb } from '../helpers/db.js'
import { createApp } from '../../src/app.js'
import { Article } from '../../src/models/Article.js'
import { Page } from '../../src/models/Page.js'
import { Image } from '../../src/models/Image.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)
beforeEach(async () => {
  await Article.deleteMany({})
  await Page.deleteMany({})
  await Image.deleteMany({})
  const cover = await Image.create({
    filename: 'testcover',
    width: 2000,
    height: 1500,
    variants: {
      thumb: { path: 'ab/testcover-thumb.webp', width: 600, height: 450 },
      medium: { path: 'ab/testcover-medium.webp', width: 1400, height: 1050 },
      large: { path: 'ab/testcover-large.webp', width: 2000, height: 1500 },
    },
  })
  await Article.create([
    { category: 'works', status: 'published', slug: { fr: 'chassis', en: 'press-frame' },
      title: { fr: 'Châssis-Presse', en: '' }, yearStart: 2018, yearEnd: 2021, yearLabel: { fr: '2018-2021' } },
    { category: 'works', status: 'published', slug: { fr: 'porte' },
      title: { fr: 'Porte' }, yearStart: 2023, cover: cover._id },
    { category: 'works', status: 'draft', slug: { fr: 'brouillon' }, title: { fr: 'Brouillon' } },
    { category: 'exhibitions', status: 'published', slug: { fr: 'expo' }, title: { fr: 'Expo' }, yearStart: 2020 },
  ])
})

describe('GET /api/articles', () => {
  it('excludes drafts', async () => {
    const res = await request(createApp()).get('/api/articles')
    expect(res.body.items.map((a) => a.slug)).not.toContain('brouillon')
  })

  it('filters by category and sorts by year descending', async () => {
    const res = await request(createApp()).get('/api/articles?category=works')
    expect(res.body.items.map((a) => a.slug)).toEqual(['porte', 'chassis'])
  })

  it('resolves titles into the requested language, falling back to French', async () => {
    const res = await request(createApp()).get('/api/articles?category=works&lang=en')
    const item = res.body.items.find((a) => a.slug === 'press-frame')
    expect(item.title).toBe('Châssis-Presse')
  })

  it('rejects an unknown category', async () => {
    const res = await request(createApp()).get('/api/articles?category=sculpture')
    expect(res.status).toBe(400)
  })

  it('degrades an unrecognised language to French', async () => {
    const res = await request(createApp()).get('/api/articles?lang=de')
    expect(res.status).toBe(200)
    expect(res.body.items[0].title).toBe('Porte')
  })
})

describe('GET /api/articles/:slug', () => {
  it('finds an article by its French or English slug', async () => {
    expect((await request(createApp()).get('/api/articles/chassis')).status).toBe(200)
    expect((await request(createApp()).get('/api/articles/press-frame?lang=en')).status).toBe(200)
  })

  it('returns 404 for a draft', async () => {
    expect((await request(createApp()).get('/api/articles/brouillon')).status).toBe(404)
  })

  it('includes previous and next within the same category', async () => {
    const res = await request(createApp()).get('/api/articles/porte')
    expect(res.body.next.slug).toBe('chassis')
    expect(res.body.prev).toBeNull()
  })

  it('resolves localized values nested inside blocks', async () => {
    await Article.create({
      category: 'works', status: 'published', slug: { fr: 'avec-blocs' }, title: { fr: 'Avec blocs' },
      blocks: [
        { type: 'text', value: { fr: '<p>Texte</p>', en: '' } },
        { type: 'specs', items: [{ term: { fr: 'Tirage', en: 'Edition' }, value: { fr: '3', en: '' } }] },
      ],
    })
    const res = await request(createApp()).get('/api/articles/avec-blocs?lang=en')
    expect(res.body.blocks[0].value).toBe('<p>Texte</p>')      // falls back to French
    expect(res.body.blocks[1].items[0].term).toBe('Edition')   // English override wins
    expect(res.body.blocks[1].items[0].value).toBe('3')
  })
})

describe('GET /api/pages/:key', () => {
  it('returns an empty page rather than 404 for a valid unseeded key', async () => {
    const res = await request(createApp()).get('/api/pages/biography')
    expect(res.status).toBe(200)
    expect(res.body.blocks).toEqual([])
  })

  it('rejects an unknown key', async () => {
    expect((await request(createApp()).get('/api/pages/nonsense')).status).toBe(400)
  })
})

describe('GET /api/home', () => {
  it('builds the slideshow from featured articles', async () => {
    await Article.updateOne({ 'slug.fr': 'porte' }, { featured: true })
    const res = await request(createApp()).get('/api/home')
    expect(res.status).toBe(200)
    expect(res.body.slides.map((s) => s.article.slug)).toEqual(['porte'])
    expect(res.body.slides[0].image.variants.medium.path).toBe('ab/testcover-medium.webp')
  })

  it('returns an empty slideshow rather than failing when nothing is featured', async () => {
    const res = await request(createApp()).get('/api/home')
    expect(res.status).toBe(200)
    expect(res.body.slides).toEqual([])
  })

  it('omits a featured work that has no cover, since a slide needs an image', async () => {
    await Article.create({ category: 'works', status: 'published', slug: { fr: 'sans-image' }, title: { fr: 'Sans image' }, featured: true })
    const res = await request(createApp()).get('/api/home')
    expect(res.body.slides.map((s) => s.article.slug)).not.toContain('sans-image')
  })
})
