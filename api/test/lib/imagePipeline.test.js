import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { processImage } from '../../src/lib/imagePipeline.js'

let root
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'media-')) })
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

async function jpeg(width, height) {
  return sharp({ create: { width, height, channels: 3, background: '#888' } }).jpeg().toBuffer()
}

async function tiff(width, height) {
  return sharp({ create: { width, height, channels: 3, background: '#888' } }).tiff().toBuffer()
}

async function rotatedJpeg(width, height, orientation) {
  return sharp({ create: { width, height, channels: 3, background: '#888' } })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer()
}

function shardOf(path) {
  const parts = path.split('/')
  return parts[0] === '_originals' ? parts[1] : parts[0]
}

describe('processImage', () => {
  it('writes three webp variants plus the original', async () => {
    const result = await processImage(await jpeg(3000, 2000), { originalName: 'Porte.jpg', mediaRoot: root })
    expect(result.width).toBe(3000)
    expect(Object.keys(result.variants).sort()).toEqual(['large', 'medium', 'original', 'thumb'])
    for (const v of Object.values(result.variants)) {
      await expect(stat(join(root, v.path))).resolves.toBeTruthy()
    }
    expect(result.variants.thumb.width).toBe(600)
    expect(result.variants.medium.width).toBe(1400)
    expect(result.variants.large.width).toBe(2400)
  })

  it('never upscales a small source', async () => {
    const result = await processImage(await jpeg(400, 300), { originalName: 's.jpg', mediaRoot: root })
    expect(result.variants.thumb.width).toBe(400)
    expect(result.variants.large.width).toBe(400)
  })

  it('is content addressed, so identical bytes reuse the filename', async () => {
    const buf = await jpeg(800, 600)
    const a = await processImage(buf, { originalName: 'a.jpg', mediaRoot: root })
    const b = await processImage(buf, { originalName: 'b.jpg', mediaRoot: root })
    expect(a.filename).toBe(b.filename)
  })

  it('rejects a non-image buffer', async () => {
    await expect(
      processImage(Buffer.from('not an image'), { originalName: 'x.jpg', mediaRoot: root })
    ).rejects.toThrow(/unsupported image/i)
  })

  it('names a TIFF original .tif and keeps its bytes as TIFF', async () => {
    const result = await processImage(await tiff(500, 400), { originalName: 't.tif', mediaRoot: root })
    expect(result.variants.original.path).toMatch(/\.tif$/)
    const written = await readFile(join(root, result.variants.original.path))
    const writtenMeta = await sharp(written).metadata()
    expect(writtenMeta.format).toBe('tiff')
  })

  it('writes the original under _originals/ and the webp variants outside it', async () => {
    const result = await processImage(await jpeg(800, 600), { originalName: 'o.jpg', mediaRoot: root })
    expect(result.variants.original.path.startsWith('_originals/')).toBe(true)
    for (const name of ['thumb', 'medium', 'large']) {
      expect(result.variants[name].path.startsWith('_originals/')).toBe(false)
    }
  })

  it('derives storage paths from content, sharded by hash, not the wall clock', async () => {
    const buf = await jpeg(900, 700)
    const a = await processImage(buf, { originalName: 'a.jpg', mediaRoot: root })
    const b = await processImage(buf, { originalName: 'b.jpg', mediaRoot: root })
    expect(b.variants).toEqual(a.variants)
    for (const v of Object.values(a.variants)) {
      expect(shardOf(v.path)).toMatch(/^[0-9a-f]{2}$/)
    }
  })

  it('reports display-true dimensions for an EXIF-rotated source', async () => {
    const buf = await rotatedJpeg(3000, 2000, 6)
    const result = await processImage(buf, { originalName: 'r.jpg', mediaRoot: root })
    expect(result.width).toBe(2000)
    expect(result.height).toBe(3000)
    expect(result.variants.original.width).toBe(2000)
    expect(result.variants.original.height).toBe(3000)
    expect(result.variants.large.width).toBe(2000)
  })
})
