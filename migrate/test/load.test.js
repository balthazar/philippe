import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, access, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import sharp from 'sharp'
import { loadAll, resolveBlockImages, collectReferencedIds, dropRedundantHiddenDuplicates } from '../load.js'
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

// Client feedback (task 27): ensureCoverInGallery (extract.js) decides
// whether to fold a cover in using the RAW legacy WordPress attachment id,
// before content-based image deduplication (this same file's import loop)
// has run. Two distinct legacy ids can resolve to the very same Mongo Image
// (a byte-identical file registered twice in WordPress) -- observed on the
// real archive (Porte Abri Anti-Nucléaire): the cover's own legacy id
// differed from the gallery item that happened to be the same underlying
// photo, so ensureCoverInGallery correctly saw no match and added a second,
// hidden reference to what became, after resolution, an image already
// visible in the same gallery. This runs once every id is a real ObjectId,
// where duplicate identity is unambiguous.
describe('dropRedundantHiddenDuplicates', () => {
  it('drops a hidden gallery item whose resolved image duplicates an already-visible one', () => {
    const blocks = [
      { type: 'gallery', items: [{ image: 'img1', hidden: false }, { image: 'img1', hidden: true }] },
    ]
    expect(dropRedundantHiddenDuplicates(blocks)).toEqual([
      { type: 'gallery', items: [{ image: 'img1', hidden: false }] },
    ])
  })

  it('keeps a hidden item whose image is not visible anywhere else', () => {
    const blocks = [{ type: 'gallery', items: [{ image: 'img1', hidden: false }, { image: 'img2', hidden: true }] }]
    expect(dropRedundantHiddenDuplicates(blocks)).toEqual(blocks)
  })

  it('matches across separate gallery blocks in the same article', () => {
    const blocks = [
      { type: 'gallery', items: [{ image: 'img1', hidden: false }] },
      { type: 'gallery', items: [{ image: 'img1', hidden: true }] },
    ]
    expect(dropRedundantHiddenDuplicates(blocks)).toEqual([
      { type: 'gallery', items: [{ image: 'img1', hidden: false }] },
      { type: 'gallery', items: [] },
    ])
  })

  it('leaves non-gallery blocks untouched', () => {
    const blocks = [{ type: 'text', value: { fr: 'x', en: '' } }]
    expect(dropRedundantHiddenDuplicates(blocks)).toEqual(blocks)
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
          // Task 30, part 5: `heading` is retired -- what used to be a
          // heading block is now a `text` block carrying an <h2>.
          { type: 'text', value: { fr: '<h2>Titre</h2>', en: '<h2>Title</h2>' } },
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
    expect(result.unmappedPageSlugs).toEqual(['not-a-real-page'])
    expect(result.unresolvedRefs).toEqual({ count: 0, ids: [] })

    await connect(mongod.getUri(), dbName)
    try {
      expect(await Image.countDocuments()).toBe(4)

      const article = await Article.findOne({ legacyWpId: 1001 })
      expect(article).not.toBeNull()
      // the image block referencing the missing file (id 5) must be gone
      expect(article.blocks.map((b) => b.type)).toEqual(['image', 'gallery', 'text', 'text'])

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

  it('counts and reports a referenced legacy id that has no entry in media.json at all, rather than silently dropping it', async () => {
    // Different failure mode from the "file missing on disk" case above: here
    // the id never even appears in media.json, so it would never enter the
    // media loop at all. Without an explicit precomputed diff this resolves
    // to a dropped block / null cover with nothing anywhere saying so.
    const media = [] // legacyWpId 42 is referenced below but has no entry here
    const articles = [
      {
        legacyWpId: 4001,
        category: 'works',
        status: 'published',
        slug: { fr: 'ghost-ref', en: 'ghost-ref-en' },
        title: { fr: 'Ghost Ref', en: 'Ghost Ref' },
        yearLabel: { fr: '2022', en: '2022' },
        yearStart: 2022,
        yearEnd: 2022,
        coverLegacyId: 42,
        blocks: [{ type: 'image', image: { legacyWpId: 42 }, caption: { fr: '', en: '' }, size: 'wide' }],
      },
    ]
    await writeFile(join(dataDir, 'media.json'), JSON.stringify(media))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articles))
    await writeFile(join(dataDir, 'pages.json'), JSON.stringify([]))

    const dbName = `test-${counter++}`
    const result = await loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName })

    expect(result.unresolvedRefs).toEqual({ count: 1, ids: [42] })

    await connect(mongod.getUri(), dbName)
    try {
      const article = await Article.findOne({ legacyWpId: 4001 })
      expect(article.cover).toBeNull()
      expect(article.blocks).toHaveLength(0) // the sole image block referenced the ghost id and was dropped
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('writes the subtitle field through to the Article document', async () => {
    // Task 26, part A1: subtitle travels through load.js the same way title
    // and yearLabel do. Without it in the explicit field list load.js
    // passes to findOneAndUpdate, extract.js's work would be silently
    // dropped at load time even with the schema fixed.
    const media = [{ legacyWpId: 1, file: 'a.png', mime: 'image/png', originalName: 'a.png' }]
    const articles = [
      {
        legacyWpId: 5001,
        category: 'works',
        status: 'published',
        slug: { fr: 'avec-sous-titre', en: '' },
        title: { fr: 'Avec sous-titre', en: '' },
        subtitle: { fr: 'Numérisation, épreuves numériques pigmentaires', en: '' },
        yearLabel: { fr: '2024', en: '' },
        yearStart: 2024,
        yearEnd: 2024,
        coverLegacyId: 1,
        blocks: [],
      },
    ]
    await writeFile(join(dataDir, 'media.json'), JSON.stringify(media))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articles))
    await writeFile(join(dataDir, 'pages.json'), JSON.stringify([]))
    await writeFile(join(uploadsRoot, 'a.png'), await png(10, 20, 30))

    const dbName = `test-${counter++}`
    await loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName })

    await connect(mongod.getUri(), dbName)
    try {
      const article = await Article.findOne({ legacyWpId: 5001 })
      expect(article.subtitle.fr).toBe('Numérisation, épreuves numériques pigmentaires')
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('preserves artist-set status, cover and gallery hidden flags across a second load, while still picking up updated source content', async () => {
    // Task 30, part 1: a re-run must still pick up corrected content from
    // the source (title, here) while never clobbering the fields the artist
    // owns through the admin: status, cover, and each gallery item's hidden
    // flag. Real incident this guards: re-running load silently republished
    // nouveau-2024, which had been deliberately set to draft.
    await writeFixtures()
    const dbName = `test-${counter++}`
    const opts = { dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName }
    await loadAll(opts)

    let image2Id
    let image3Id
    await connect(mongod.getUri(), dbName)
    try {
      const image2 = await Image.findOne({ legacyWpId: 2 })
      const image3 = await Image.findOne({ legacyWpId: 3 })
      image2Id = image2._id
      image3Id = image3._id

      // Simulate the admin: unpublish the article, change its cover away
      // from what the source/extraction would set, and hide one gallery item.
      const article = await Article.findOne({ legacyWpId: 1001 })
      article.status = 'draft'
      article.cover = image2Id
      article.blocks = article.blocks.map((b) =>
        b.type === 'gallery'
          ? { ...b, items: b.items.map((it) => (String(it.image) === String(image3Id) ? { ...it, hidden: true } : it)) }
          : b
      )
      await article.save()
    } finally {
      await disconnect()
    }

    // Simulate a corrected source: the title changes in the WordPress export.
    const articlesJson = JSON.parse(await readFile(join(dataDir, 'articles.json'), 'utf8'))
    articlesJson[0].title = { fr: 'Œuvre A (corrigé)', en: 'Work A (fixed)' }
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articlesJson))

    await loadAll(opts)

    await connect(mongod.getUri(), dbName)
    try {
      const article = await Article.findOne({ legacyWpId: 1001 })
      expect(article.status).toBe('draft') // preserved, not republished
      expect(String(article.cover)).toBe(String(image2Id)) // preserved, not reset from coverLegacyId
      const galleryBlock = article.blocks.find((b) => b.type === 'gallery')
      const item3 = galleryBlock.items.find((it) => String(it.image) === String(image3Id))
      expect(item3.hidden).toBe(true) // preserved
      expect(article.title.fr).toBe('Œuvre A (corrigé)') // content still updates
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('preserves an artist-chosen gallery mode across a second load, distinct from the migration-set default', async () => {
    // Task 30 (client feedback, gallery slider default for exhibitions): the
    // migration sets a per-category default for a gallery block's `mode`
    // (extract.js's defaultGalleryMode); the loader must preserve any later
    // change away from that default, same "artist owns it" rule as status/
    // cover/hidden above, for the same reason (toggleable in the admin).
    // Deliberately a DIFFERENT shape of test from the one above: `mode`
    // here has a migration-SET, non-default value on the very first load
    // ('slider'), not a field the migration simply leaves alone -- a re-run
    // must preserve the artist's later change (back to 'grid') rather than
    // reapplying the source's own 'slider' default every time.
    await writeFixtures()
    const dbName = `test-${counter++}`
    const opts = { dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName }

    const articlesJson = JSON.parse(await readFile(join(dataDir, 'articles.json'), 'utf8'))
    articlesJson[0].blocks = articlesJson[0].blocks.map((b) => (b.type === 'gallery' ? { ...b, mode: 'slider' } : b))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articlesJson))

    await loadAll(opts)

    await connect(mongod.getUri(), dbName)
    try {
      const article = await Article.findOne({ legacyWpId: 1001 })
      const galleryBlock = article.blocks.find((b) => b.type === 'gallery')
      expect(galleryBlock.mode).toBe('slider') // the migration's own default applied on first import

      // Simulate the admin: the artist switches this gallery back to grid.
      article.blocks = article.blocks.map((b) => (b.type === 'gallery' ? { ...b, mode: 'grid' } : b))
      await article.save()
    } finally {
      await disconnect()
    }

    // Re-run against the SAME source (still says 'slider'): must never
    // silently revert the artist's own later choice.
    await loadAll(opts)

    await connect(mongod.getUri(), dbName)
    try {
      const article = await Article.findOne({ legacyWpId: 1001 })
      const galleryBlock = article.blocks.find((b) => b.type === 'gallery')
      expect(galleryBlock.mode).toBe('grid') // preserved, not reverted to the source's 'slider'
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('applies the migration-set gallery mode default when the existing document predates the field entirely, rather than clobbering it with undefined', async () => {
    // Real incident this guards: the live database was loaded before
    // `mode` existed in the schema at all, so every existing gallery block
    // has no `mode` key whatsoever (not "artist chose grid" -- "the field
    // never existed here yet"). A re-run that extracted a fresh 'slider'
    // default for an exhibitions gallery must apply it, not preserve the
    // absence of a field nobody ever set. This is the opposite failure mode
    // from the "artist chose grid, keep it" test above: there, `existing`
    // genuinely held 'grid'; here, `existing` holds nothing at all.
    await writeFixtures()
    const dbName = `test-${counter++}`
    const opts = { dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName }

    await loadAll(opts)

    // Directly strip `mode` at the raw Mongo level (bypassing Mongoose's
    // own schema default) to genuinely simulate a document written before
    // `mode` existed in the schema at all -- calling loadAll() twice in a
    // row is NOT enough on its own to reproduce this: the current schema's
    // `setDefaultsOnInsert` would already write a real `mode: 'grid'` on
    // the very first insert, which is a different (and already correctly
    // handled) case from "the field is genuinely absent".
    await connect(mongod.getUri(), dbName)
    try {
      await Article.updateOne(
        { legacyWpId: 1001, 'blocks.type': 'gallery' },
        { $unset: { 'blocks.$.mode': '' } }
      )
      const before = await Article.findOne({ legacyWpId: 1001 }).lean()
      expect(before.blocks.find((b) => b.type === 'gallery').mode).toBeUndefined()
    } finally {
      await disconnect()
    }

    // Re-run: the source now sets 'slider' (simulates extract.js's
    // defaultGalleryMode running against a database that already has this
    // article, whose gallery block has no `mode` key whatsoever).
    const articlesJson = JSON.parse(await readFile(join(dataDir, 'articles.json'), 'utf8'))
    articlesJson[0].blocks = articlesJson[0].blocks.map((b) => (b.type === 'gallery' ? { ...b, mode: 'slider' } : b))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articlesJson))

    await loadAll(opts)

    await connect(mongod.getUri(), dbName)
    try {
      const article = await Article.findOne({ legacyWpId: 1001 })
      const galleryBlock = article.blocks.find((b) => b.type === 'gallery')
      expect(galleryBlock.mode).toBe('slider')
    } finally {
      await disconnect()
    }
  }, 60_000)

  it('prunes a previously-imported legacy image (and its files) once nothing references it any more', async () => {
    // Task 26, part A3: simulates the leftover Mongo state an earlier,
    // unfixed run would have left for icone-oeuvres.jpg -- extract.js no
    // longer emits it or any block referencing it, but a load run against
    // a database populated before that fix must still clean it up, after
    // confirming (freshly, against the just-loaded state) that nothing
    // references it any more.
    await writeFixtures()
    const dbName = `test-${counter++}`
    const opts = { dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName }
    await loadAll(opts)

    const variantPath = 'or/orphan-thumb.webp'
    await mkdir(join(mediaRoot, 'or'), { recursive: true })
    await writeFile(join(mediaRoot, variantPath), 'stale-thumb-bytes')

    await connect(mongod.getUri(), dbName)
    let orphanId
    try {
      const orphan = await Image.create({
        filename: 'orphanhash',
        legacyWpId: 99999,
        legacyUrl: '/wp-content/uploads/2018/04/icone-oeuvres.jpg',
        width: 300,
        height: 300,
        variants: { thumb: { path: variantPath, width: 300, height: 300 } },
      })
      orphanId = orphan._id
    } finally {
      await disconnect()
    }

    const result = await loadAll(opts)
    expect(result.imagesPruned).toBe(1)

    await connect(mongod.getUri(), dbName)
    try {
      expect(await Image.findById(orphanId)).toBeNull()
    } finally {
      await disconnect()
    }
    await expect(access(join(mediaRoot, variantPath))).rejects.toThrow()
  }, 60_000)

  it('leaves an image alone if something still references it, even when its filename matches a purged name', async () => {
    // Guards against an over-eager prune: an image whose legacyUrl happens
    // to end in a purged filename must survive if it is genuinely still
    // referenced by a current article. The reference has to come through
    // articles.json (the source of truth loadAll re-upserts blocks from
    // wholesale on every run), not a direct Mongo write, or the article
    // upsert earlier in the same run would just overwrite it away again.
    const media = [
      { legacyWpId: 1, file: 'a.png', mime: 'image/png', originalName: 'a.png' },
      { legacyWpId: 7, file: 'icone-oeuvres.jpg', mime: 'image/jpeg', originalName: 'icone-oeuvres.jpg' },
    ]
    const articles = [
      {
        legacyWpId: 6001,
        category: 'works',
        status: 'published',
        slug: { fr: 'still-used', en: '' },
        title: { fr: 'Still Used', en: '' },
        yearLabel: { fr: '2024', en: '' },
        yearStart: 2024,
        yearEnd: 2024,
        coverLegacyId: 1,
        blocks: [{ type: 'image', image: { legacyWpId: 7 }, caption: { fr: '', en: '' }, size: 'wide' }],
      },
    ]
    await writeFile(join(dataDir, 'media.json'), JSON.stringify(media))
    await writeFile(join(dataDir, 'articles.json'), JSON.stringify(articles))
    await writeFile(join(dataDir, 'pages.json'), JSON.stringify([]))
    await writeFile(join(uploadsRoot, 'a.png'), await png(1, 2, 3))
    await writeFile(join(uploadsRoot, 'icone-oeuvres.jpg'), await png(4, 5, 6))

    const dbName = `test-${counter++}`
    const result = await loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri: mongod.getUri(), dbName })

    expect(result.imagesPruned).toBe(0)
    await connect(mongod.getUri(), dbName)
    try {
      expect(await Image.findOne({ legacyWpId: 7 })).not.toBeNull()
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
