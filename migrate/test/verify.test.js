import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  checkCounts,
  checkArticles,
  checkCovers,
  checkImageRefs,
  checkImageFiles,
  checkNoPlaceholderHeadings,
  checkNoPurgedImageRefs,
  verify,
} from '../verify.js'
import { connect, disconnect } from '../../api/src/db.js'
import { Article } from '../../api/src/models/Article.js'
import { Page } from '../../api/src/models/Page.js'
import { Image } from '../../api/src/models/Image.js'

describe('checkCounts', () => {
  it('fails when the article count is not 63', () => {
    expect(checkCounts({ articles: 62, pages: 7 }).failures).toContain('expected 63 articles, found 62')
  })

  it('fails when the page count is not 7', () => {
    expect(checkCounts({ articles: 63, pages: 6 }).failures).toContain('expected 7 pages, found 6')
  })

  it('passes on the expected counts', () => {
    expect(checkCounts({ articles: 63, pages: 7 }).failures).toEqual([])
  })
})

describe('checkArticles', () => {
  it('fails an article with no blocks', () => {
    const result = checkArticles([{ slug: { fr: 'b' }, cover: 'x', blocks: [] }])
    expect(result.failures[0]).toMatch(/b.*blocks/)
  })

  it('warns, rather than fails, when an article has no English slug', () => {
    const result = checkArticles([{ slug: { fr: 'c', en: '' }, cover: 'x', blocks: [{ type: 'text' }] }])
    expect(result.failures).toEqual([])
    expect(result.warnings[0]).toMatch(/c/)
  })

  it('fails on a duplicate French slug', () => {
    const articles = [
      { slug: { fr: 'dup', en: 'a' }, cover: 'x', blocks: [{ type: 'text' }] },
      { slug: { fr: 'dup', en: 'b' }, cover: 'x', blocks: [{ type: 'text' }] },
    ]
    const result = checkArticles(articles)
    expect(result.failures).toContain('duplicate fr slug: dup')
  })

  it('fails on a duplicate English slug', () => {
    const articles = [
      { slug: { fr: 'a', en: 'dup' }, cover: 'x', blocks: [{ type: 'text' }] },
      { slug: { fr: 'b', en: 'dup' }, cover: 'x', blocks: [{ type: 'text' }] },
    ]
    const result = checkArticles(articles)
    expect(result.failures).toContain('duplicate en slug: dup')
  })

  it('does not treat two articles missing an English slug as duplicates', () => {
    const articles = [
      { slug: { fr: 'a', en: '' }, cover: 'x', blocks: [{ type: 'text' }] },
      { slug: { fr: 'b', en: '' }, cover: 'x', blocks: [{ type: 'text' }] },
    ]
    const result = checkArticles(articles)
    expect(result.failures).toEqual([])
  })
})

// Coordinator correction, task 29: the migration used to assign every
// exhibition article the same work's cover image (a bad WordPress
// _thumbnail_id shared by all 25 exhibition posts -- see extract.js's
// coverLegacyIdFor), and the old checkArticles cover assertion ("every
// article has a cover") would happily pass a rebuild that reintroduced that
// exact bug. The real invariant: a works article must have a cover, and
// that cover must be one of its own gallery images; an exhibition article
// must have none at all.
describe('checkCovers', () => {
  it('fails a works article with no cover', () => {
    const result = checkCovers([{ slug: { fr: 'a' }, category: 'works', cover: null, blocks: [] }])
    expect(result.failures[0]).toMatch(/a.*cover/)
  })

  it('fails a works article whose cover is not among its own gallery images', () => {
    const articles = [{
      slug: { fr: 'a' },
      category: 'works',
      cover: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      blocks: [{ type: 'gallery', items: [{ image: 'bbbbbbbbbbbbbbbbbbbbbbbb' }] }],
    }]
    const result = checkCovers(articles)
    expect(result.failures[0]).toMatch(/a.*gallery/)
  })

  it('passes a works article whose cover is among its own gallery images', () => {
    const articles = [{
      slug: { fr: 'a' },
      category: 'works',
      cover: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      blocks: [{ type: 'gallery', items: [{ image: 'aaaaaaaaaaaaaaaaaaaaaaaa', hidden: true }] }],
    }]
    expect(checkCovers(articles).failures).toEqual([])
  })

  it('fails an exhibition article that has a cover at all', () => {
    const articles = [{
      slug: { fr: '2023' },
      category: 'exhibitions',
      cover: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      blocks: [{ type: 'gallery', items: [{ image: 'aaaaaaaaaaaaaaaaaaaaaaaa' }] }],
    }]
    const result = checkCovers(articles)
    expect(result.failures[0]).toMatch(/2023.*cover/)
  })

  it('passes an exhibition article with no cover', () => {
    const articles = [{ slug: { fr: '2023' }, category: 'exhibitions', cover: null, blocks: [] }]
    expect(checkCovers(articles).failures).toEqual([])
  })
})

describe('checkImageRefs', () => {
  const imageIds = new Set(['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'])

  it('fails when an article cover points at an image that does not exist', () => {
    const articles = [{ slug: { fr: 'a' }, cover: 'cccccccccccccccccccccccc', blocks: [] }]
    const result = checkImageRefs({ articles, pages: [] }, imageIds)
    expect(result.failures[0]).toMatch(/a.*cover.*cccccccccccccccccccccccc/)
  })

  it('fails when a block image reference is dangling', () => {
    const articles = [
      {
        slug: { fr: 'a' },
        cover: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        blocks: [{ type: 'image', image: 'cccccccccccccccccccccccc' }],
      },
    ]
    const result = checkImageRefs({ articles, pages: [] }, imageIds)
    expect(result.failures[0]).toMatch(/a.*cccccccccccccccccccccccc/)
  })

  it('fails when a gallery item image reference is dangling', () => {
    const articles = [
      {
        slug: { fr: 'a' },
        cover: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        blocks: [{ type: 'gallery', items: [{ image: 'cccccccccccccccccccccccc' }] }],
      },
    ]
    const result = checkImageRefs({ articles, pages: [] }, imageIds)
    expect(result.failures[0]).toMatch(/a.*cccccccccccccccccccccccc/)
  })

  it('checks page blocks and page gallery items too', () => {
    const pages = [
      {
        key: 'home',
        blocks: [
          { type: 'image', image: 'cccccccccccccccccccccccc' },
          { type: 'gallery', items: [{ image: 'dddddddddddddddddddddddd' }] },
        ],
      },
    ]
    const result = checkImageRefs({ articles: [], pages }, imageIds)
    expect(result.failures).toHaveLength(2)
    expect(result.failures.some((f) => f.includes('home'))).toBe(true)
  })

  it('passes when every reference resolves', () => {
    const articles = [
      {
        slug: { fr: 'a' },
        cover: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        blocks: [
          { type: 'image', image: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
          { type: 'gallery', items: [{ image: 'aaaaaaaaaaaaaaaaaaaaaaaa' }] },
        ],
      },
    ]
    const pages = [{ key: 'home', blocks: [{ type: 'image', image: 'bbbbbbbbbbbbbbbbbbbbbbbb' }] }]
    const result = checkImageRefs({ articles, pages }, imageIds)
    expect(result.failures).toEqual([])
  })
})

describe('checkNoPlaceholderHeadings', () => {
  it('fails when an article carries the unfilled Elementor placeholder', () => {
    const articles = [{ slug: { fr: 'a' }, blocks: [{ type: 'heading', value: { fr: 'Ajoutez votre titre ici' } }] }]
    const result = checkNoPlaceholderHeadings(articles, [])
    expect(result.failures[0]).toMatch(/a.*placeholder/)
  })

  it('fails when a page carries the unfilled Elementor placeholder', () => {
    const pages = [{ key: 'home', blocks: [{ type: 'heading', value: { fr: 'Ajoutez votre titre ici' } }] }]
    const result = checkNoPlaceholderHeadings([], pages)
    expect(result.failures[0]).toMatch(/home.*placeholder/)
  })

  it('passes a real heading untouched', () => {
    const articles = [{ slug: { fr: 'a' }, blocks: [{ type: 'heading', value: { fr: 'Rectos / Versos' } }] }]
    expect(checkNoPlaceholderHeadings(articles, []).failures).toEqual([])
  })
})

describe('checkNoPurgedImageRefs', () => {
  it('fails when an Image document for the purged filename still exists', () => {
    const images = [{ _id: 'x', legacyUrl: '/wp-content/uploads/2018/04/icone-oeuvres.jpg' }]
    const result = checkNoPurgedImageRefs(images)
    expect(result.failures[0]).toMatch(/icone-oeuvres\.jpg/)
  })

  it('passes when no image matches the purged filename', () => {
    const images = [{ _id: 'x', legacyUrl: '/wp-content/uploads/2018/04/porte.jpg' }]
    expect(checkNoPurgedImageRefs(images).failures).toEqual([])
  })
})

describe('checkImageFiles', () => {
  let mediaRoot

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'philippe-verify-'))
    await mkdir(join(mediaRoot, 'ab'), { recursive: true })
    await writeFile(join(mediaRoot, 'ab', 'thumb.webp'), 'x')
    await writeFile(join(mediaRoot, 'ab', 'medium.webp'), 'x')
    // large.webp is intentionally NOT written, to exercise the failure path
    await mkdir(join(mediaRoot, '_originals', 'ab'), { recursive: true })
    await writeFile(join(mediaRoot, '_originals', 'ab', 'original.jpg'), 'x')
  })

  it('passes when all four variants exist on disk', async () => {
    const images = [
      {
        filename: 'complete',
        variants: {
          thumb: { path: 'ab/thumb.webp' },
          medium: { path: 'ab/medium.webp' },
          large: { path: 'ab/medium.webp' },
          original: { path: '_originals/ab/original.jpg' },
        },
      },
    ]
    const result = await checkImageFiles(images, mediaRoot)
    expect(result.failures).toEqual([])
  })

  it('fails when a variant file is missing on disk', async () => {
    const images = [
      {
        filename: 'broken',
        variants: {
          thumb: { path: 'ab/thumb.webp' },
          medium: { path: 'ab/medium.webp' },
          large: { path: 'ab/large.webp' },
          original: { path: '_originals/ab/original.jpg' },
        },
      },
    ]
    const result = await checkImageFiles(images, mediaRoot)
    expect(result.failures[0]).toMatch(/broken.*large/)
  })

  it('fails when a variant is missing from the document entirely', () => {
    return checkImageFiles(
      [{ filename: 'nodata', variants: { thumb: { path: 'ab/thumb.webp' }, medium: { path: 'ab/medium.webp' } } }],
      mediaRoot
    ).then((result) => {
      expect(result.failures.some((f) => f.includes('nodata') && f.includes('large'))).toBe(true)
      expect(result.failures.some((f) => f.includes('nodata') && f.includes('original'))).toBe(true)
    })
  })
})

describe('verify (integration)', () => {
  let mongod
  let mediaRoot

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    mediaRoot = await mkdtemp(join(tmpdir(), 'philippe-verify-integration-'))
  })

  afterAll(async () => {
    await mongod.stop()
  })

  it('fails loudly against an empty database, rather than passing vacuously', async () => {
    const result = await verify({ mongoUri: mongod.getUri(), dbName: 'verify_empty_db', mediaRoot })
    expect(result.ok).toBe(false)
    expect(result.failures).toContain('expected 63 articles, found 0')
    expect(result.failures).toContain('expected 7 pages, found 0')
  })

  it('passes against a small but internally-consistent database', async () => {
    await connect(mongod.getUri(), 'verify_consistent_db')
    try {
      await Image.deleteMany({})
      await Article.deleteMany({})
      await Page.deleteMany({})

      const shard = join(mediaRoot, 'sh')
      await mkdir(shard, { recursive: true })
      await mkdir(join(mediaRoot, '_originals', 'sh'), { recursive: true })
      for (const name of ['thumb.webp', 'medium.webp', 'large.webp']) {
        await writeFile(join(shard, name), 'x')
      }
      await writeFile(join(mediaRoot, '_originals', 'sh', 'original.jpg'), 'x')

      const image = await Image.create({
        filename: 'consistenthash',
        legacyWpId: 1,
        variants: {
          thumb: { path: 'sh/thumb.webp' },
          medium: { path: 'sh/medium.webp' },
          large: { path: 'sh/large.webp' },
          original: { path: '_originals/sh/original.jpg' },
        },
      })

      const articles = []
      for (let i = 0; i < 63; i += 1) {
        articles.push({
          slug: { fr: `fr-${i}`, en: i === 0 ? '' : `en-${i}` },
          category: 'works',
          cover: image._id,
          // The cover must be one of the article's own gallery images
          // (task 29 correction) -- a plain `image` block would no longer
          // satisfy checkCovers.
          blocks: [{ type: 'gallery', items: [{ image: image._id }] }],
          status: 'published',
          legacyWpId: 1000 + i,
        })
      }
      await Article.insertMany(articles)

      const pageKeys = ['home', 'works', 'biography', 'contact', 'bibliography', 'links', 'legal']
      await Page.insertMany(pageKeys.map((key) => ({ key, blocks: [] })))

      const result = await verify({ mongoUri: mongod.getUri(), dbName: 'verify_consistent_db', mediaRoot })
      expect(result.failures).toEqual([])
      expect(result.ok).toBe(true)
      expect(result.report.articles).toBe(63)
      expect(result.report.pages).toBe(7)
      expect(result.report.images).toBe(1)
      expect(result.warnings[0]).toMatch(/fr-0/)
    } finally {
      // verify() disconnects mongoose itself once it's done, so reconnect
      // before tidying up the fixture data it just verified.
      await connect(mongod.getUri(), 'verify_consistent_db')
      await Image.deleteMany({})
      await Article.deleteMany({})
      await Page.deleteMany({})
      await disconnect()
    }
  })
})
