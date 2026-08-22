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
})
