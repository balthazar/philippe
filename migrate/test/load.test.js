import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import sharp from 'sharp'
import { loadAll, resolveBlockImages, collectReferencedIds } from '../load.js'
import { connect, disconnect } from '../../api/src/db.js'
import { Article } from '../../api/src/models/Article.js'
import { Page } from '../../api/src/models/Page.js'
import { Image } from '../../api/src/models/Image.js'

describe('resolveBlockImages', () => {
  const byLegacyId = new Map([[10, 'aaaaaaaaaaaaaaaaaaaaaaaa'], [11, 'bbbbbbbbbbbbbbbbbbbbbbbb']])

  it('replaces legacy placeholders with ObjectIds', () => {
    const blocks = [{ type: 'image', image: { legacyWpId: 10 }, caption: { fr: '', en: '' } }]
    expect(resolveBlockImages(blocks, byLegacyId)[0].image).toBe('aaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('resolves gallery items too', () => {
    const blocks = [{ type: 'gallery', items: [{ image: { legacyWpId: 11 } }] }]
    expect(resolveBlockImages(blocks, byLegacyId)[0].items[0].image).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
  })

  it('drops an image block whose file never made it, rather than storing a dangling ref', () => {
    const blocks = [{ type: 'image', image: { legacyWpId: 999 } }, { type: 'text', value: { fr: 'x' } }]
    const out = resolveBlockImages(blocks, byLegacyId)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('text')
  })

  it('leaves text blocks untouched', () => {
    const blocks = [{ type: 'text', value: { fr: '<p>x</p>', en: '' } }]
    expect(resolveBlockImages(blocks, byLegacyId)).toEqual(blocks)
  })

  it('drops a gallery block entirely when every item in it is unresolved', () => {
    const blocks = [{ type: 'gallery', items: [{ image: { legacyWpId: 999 } }] }]
    expect(resolveBlockImages(blocks, byLegacyId)).toHaveLength(0)
  })
})

describe('collectReferencedIds', () => {
  it('collects a cover, an image block and gallery items across articles and pages', () => {
    const articles = [
      {
        coverLegacyId: 1,
        blocks: [
          { type: 'image', image: { legacyWpId: 2 } },
          { type: 'gallery', items: [{ image: { legacyWpId: 3 } }, { image: { legacyWpId: 4 } }] },
          { type: 'text', value: { fr: 'x' } },
        ],
      },
    ]
    const pages = [{ blocks: [{ type: 'image', image: { legacyWpId: 5 } }] }]
    expect(collectReferencedIds(articles, pages)).toEqual(new Set([1, 2, 3, 4, 5]))
  })

  it('ignores media that nothing references', () => {
    const articles = [{ blocks: [{ type: 'text', value: { fr: 'x' } }] }]
    expect(collectReferencedIds(articles, [])).toEqual(new Set())
  })
})

describe('loadAll', () => {
  let mongod
  let dataDir
  let uploadsRoot
  let mediaRoot
  let counter = 0

  const png = (r, g, b) => sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g, b } } }).png().toBuffer()

  async function writeFixtures({ mediaFile5Missing = true } = {}) {
    const media = [
      { legacyWpId: 1, file: 'a.png', mime: 'image/png', originalName: 'a.png' },
      { legacyWpId: 2, file: 'b.png', mime: 'image/png', originalName: 'b.png' },
      { legacyWpId: 3, file: 'c.png', mime: 'image/png', originalName: 'c.png' },
      { legacyWpId: 4, file: 'unreferenced.png', mime: 'image/png', originalName: 'unreferenced.png' },
      { legacyWpId: 5, file: 'missing.png', mime: 'image/png', originalName: 'missing.png' },
      { legacyWpId: 6, file: 'd.png', mime: 'image/png', originalName: 'd.png' },
    ]
    const articles = [
      {
        legacyWpId: 1001,
        category: 'works',
        status: 'published',
        slug: { fr: 'oeuvre-a', en: 'work-a' },
        title: { fr: 'Œuvre A', en: 'Work A' },
        yearLabel: { fr: '2020', en: '2020' },
        yearStart: 2020,
        yearEnd: 2020,
        coverLegacyId: 1,
        blocks: [
          { type: 'image', image: { legacyWpId: 1 }, caption: { fr: '', en: '' }, size: 'wide' },
          {
            type: 'gallery',
            columns: 3,
            items: [
              { image: { legacyWpId: 2 }, caption: { fr: '', en: '' } },
              { image: { legacyWpId: 3 }, caption: { fr: '', en: '' } },
            ],
          },
          { type: 'heading', value: { fr: 'Titre', en: 'Title' }, level: 2 },
          { type: 'text', value: { fr: '<p>x</p>', en: '<p>x</p>' } },
          { type: 'image', image: { legacyWpId: 5 }, caption: { fr: '', en: '' }, size: 'wide' },
        ],
      },
    ]
    const pages = [
      {
        legacyWpId: 2001,
        sourceSlug: 'accueil',
        title: { fr: 'Accueil', en: 'Home' },
        blocks: [{ type: 'image', image: { legacyWpId: 6 }, caption: { fr: '', en: '' }, size: 'full' }],
      },
      {
        legacyWpId: 2002,
        sourceSlug: 'not-a-real-page',
        title: { fr: 'Mystere', en: 'Mystery' },
        blocks: [],
      },
    ]
    await writeFile(join(dataDir, 'media.json'), JSON.stringify(media))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articles))
    await writeFile(join(dataDir, 'pages.json'), JSON.stringify(pages))

    await writeFile(join(uploadsRoot, 'a.png'), await png(255, 0, 0))
    await writeFile(join(uploadsRoot, 'b.png'), await png(0, 255, 0))
    await writeFile(join(uploadsRoot, 'c.png'), await png(0, 0, 255))
    await writeFile(join(uploadsRoot, 'unreferenced.png'), await png(1, 1, 1))
    await writeFile(join(uploadsRoot, 'd.png'), await png(9, 9, 9))
    // 'missing.png' (legacyWpId 5) is intentionally never written: it is
    // referenced by an article block, but the file never made it across.
    if (!mediaFile5Missing) await writeFile(join(uploadsRoot, 'missing.png'), await png(2, 2, 2))
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    const root = await mkdtemp(join(tmpdir(), 'philippe-load-test-'))
    dataDir = join(root, 'data')
    uploadsRoot = join(root, 'uploads')
    mediaRoot = join(root, 'media')
    await mkdir(dataDir, { recursive: true })
    await mkdir(uploadsRoot, { recursive: true })
    await mkdir(mediaRoot, { recursive: true })
  }, 60_000)

  afterAll(async () => {
    if (mongod) await mongod.stop()
  })

  it('imports only referenced media, drops blocks for missing files, maps page slugs, and writes resolvable image/gallery blocks', async () => {
    await writeFixtures()
    const dbName = `test-${counter++}`
    const result = await loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName })

    expect(result.images).toBe(4) // legacyWpId 1, 2, 3, 6 (5 is missing on disk, 4 is unreferenced)
    expect(result.imagesSkippedUnreferenced).toBe(1) // legacyWpId 4
    expect(result.imagesSkippedMissingFile).toBe(1) // legacyWpId 5
    expect(result.articles).toBe(1)
    expect(result.pages).toBe(1) // 'not-a-real-page' has no mapping and is skipped

    await connect(mongod.getUri(), dbName)
    try {
      expect(await Image.countDocuments()).toBe(4)

      const article = await Article.findOne({ legacyWpId: 1001 })
      expect(article).not.toBeNull()
      // the image block referencing the missing file (id 5) must be gone
      expect(article.blocks.map((b) => b.type)).toEqual(['image', 'gallery', 'heading', 'text'])

      const coverImage = await Image.findOne({ legacyWpId: 1 })
      expect(String(article.cover)).toBe(String(coverImage._id))

      const imageBlock = article.blocks[0]
      expect(String(imageBlock.image)).toBe(String(coverImage._id))

      const galleryBlock = article.blocks[1]
      const image2 = await Image.findOne({ legacyWpId: 2 })
      const image3 = await Image.findOne({ legacyWpId: 3 })
      expect(galleryBlock.items).toHaveLength(2)
      expect(String(galleryBlock.items[0].image)).toBe(String(image2._id))
      expect(String(galleryBlock.items[1].image)).toBe(String(image3._id))

      const page = await Page.findOne({ key: 'home' })
      expect(page).not.toBeNull()
      const image6 = await Image.findOne({ legacyWpId: 6 })
      expect(String(page.blocks[0].image)).toBe(String(image6._id))

      expect(await Page.countDocuments()).toBe(1)
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('is idempotent: running twice creates no duplicates and re-uses existing images', async () => {
    await writeFixtures()
    const dbName = `test-${counter++}`
    const opts = { dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName }

    const first = await loadAll(opts)
    const second = await loadAll(opts)

    expect(second.images).toBe(first.images)
    expect(second.articles).toBe(first.articles)
    expect(second.pages).toBe(first.pages)

    await connect(mongod.getUri(), dbName)
    try {
      expect(await Image.countDocuments()).toBe(4)
      expect(await Article.countDocuments()).toBe(1)
      expect(await Page.countDocuments()).toBe(1)
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('dedupes by content when two legacy WordPress attachment ids point at byte-identical files', async () => {
    // WordPress sometimes registers the same physical upload under two
    // distinct attachment ids. Image.filename is a content hash with a
    // unique index, so importing the second id naively would attempt a
    // second insert with the same filename and throw E11000. The loader
    // must instead recognize the duplicate content and reuse the existing
    // Image document.
    const media = [
      { legacyWpId: 10, file: 'orig.png', mime: 'image/png', originalName: 'orig.png' },
      { legacyWpId: 11, file: 'orig-again.png', mime: 'image/png', originalName: 'orig-again.png' },
    ]
    const articles = [
      {
        legacyWpId: 3001,
        category: 'works',
        status: 'published',
        slug: { fr: 'dup-a', en: 'dup-a-en' },
        title: { fr: 'Dup A', en: 'Dup A' },
        yearLabel: { fr: '2021', en: '2021' },
        yearStart: 2021,
        yearEnd: 2021,
        coverLegacyId: 10,
        blocks: [{ type: 'image', image: { legacyWpId: 11 }, caption: { fr: '', en: '' }, size: 'wide' }],
      },
    ]
    await writeFile(join(dataDir, 'media.json'), JSON.stringify(media))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articles))
    await writeFile(join(dataDir, 'pages.json'), JSON.stringify([]))

    const identicalBytes = await png(42, 42, 42)
    await writeFile(join(uploadsRoot, 'orig.png'), identicalBytes)
    await writeFile(join(uploadsRoot, 'orig-again.png'), identicalBytes)

    const dbName = `test-${counter++}`
    const result = await loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName })

    expect(result.images).toBe(2)
    expect(result.imagesDedupedByContent).toBe(1)

    await connect(mongod.getUri(), dbName)
    try {
      // one physical Image document, even though two legacy ids referenced it
      expect(await Image.countDocuments()).toBe(1)
      const article = await Article.findOne({ legacyWpId: 3001 })
      const onlyImage = await Image.findOne({ legacyWpId: 10 })
      expect(String(article.cover)).toBe(String(onlyImage._id))
      expect(String(article.blocks[0].image)).toBe(String(onlyImage._id))
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('imports every media item, referenced or not, when MIGRATE_ALL_MEDIA=1', async () => {
    await writeFixtures({ mediaFile5Missing: false })
    const dbName = `test-${counter++}`
    process.env.MIGRATE_ALL_MEDIA = '1'
    let result
    try {
      result = await loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName })
    } finally {
      delete process.env.MIGRATE_ALL_MEDIA
    }

    expect(result.images).toBe(6) // all six media entries, including the unreferenced one
    expect(result.imagesSkippedUnreferenced).toBe(0)

    await connect(mongod.getUri(), dbName)
    try {
      expect(await Image.countDocuments()).toBe(6)
    } finally {
      await disconnect()
    }
  }, 60_000)
})
