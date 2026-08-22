import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  checkCounts,
  checkArticles,
  checkImageRefs,
  checkImageFiles,
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
  it('fails an article with no cover', () => {
    const result = checkArticles([{ slug: { fr: 'a' }, cover: null, blocks: [{ type: 'text' }] }])
    expect(result.failures[0]).toMatch(/a.*cover/)
  })

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
          blocks: [{ type: 'image', image: image._id }],
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
