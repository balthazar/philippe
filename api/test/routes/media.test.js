import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import sharp from 'sharp'
import { withDb } from '../helpers/db.js'
import { loginAgent } from '../helpers/agent.js'
import { createApp } from '../../src/app.js'
import { Image } from '../../src/models/Image.js'
import { Article } from '../../src/models/Article.js'
import { Page } from '../../src/models/Page.js'

const db = withDb()
let root

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  root = await mkdtemp(join(tmpdir(), 'media-api-'))
  process.env.MEDIA_ROOT = root
  await db.start()
})
afterAll(async () => { await db.stop(); await rm(root, { recursive: true, force: true }) })
beforeEach(async () => { await Image.deleteMany({}); await Article.deleteMany({}); await Page.deleteMany({}) })

const png = () => sharp({ create: { width: 900, height: 600, channels: 3, background: '#333' } }).png().toBuffer()

describe('POST /api/admin/images', () => {
  it('stores an uploaded image and returns its variants', async () => {
    const agent = await loginAgent()
    const res = await agent.post('/api/admin/images').attach('file', await png(), 'Porte.png')
    expect(res.status).toBe(201)
    expect(res.body.variants.thumb.width).toBe(600)
    expect(await Image.countDocuments()).toBe(1)
  })

  it('rejects a non-image upload', async () => {
    const agent = await loginAgent()
    const res = await agent.post('/api/admin/images').attach('file', Buffer.from('#!/bin/sh'), 'evil.sh')
    expect(res.status).toBe(400)
  })

  it('requires authentication', async () => {
    const res = await request(createApp()).post('/api/admin/images').attach('file', await png(), 'a.png')
    expect(res.status).toBe(401)
  })

  it('rejects an oversized upload with 413, not a 500', async () => {
    const agent = await loginAgent()
    const big = Buffer.alloc(31 * 1024 * 1024) // over the 30 MB multer limit
    const res = await agent.post('/api/admin/images').attach('file', big, 'big.png')
    expect(res.status).toBe(413)
    expect(res.body).toHaveProperty('error')
  })
})

describe('DELETE /api/admin/images/:id', () => {
  it('refuses to delete an image still used as a cover', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    await Article.create({ category: 'works', slug: { fr: 'a' }, title: { fr: 'A' }, cover: up.body._id })
    const res = await agent.delete(`/api/admin/images/${up.body._id}`)
    expect(res.status).toBe(409)
    expect(await Image.countDocuments()).toBe(1)
  })

  it('deletes an unused image', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'b.png')
    expect((await agent.delete(`/api/admin/images/${up.body._id}`)).status).toBe(200)
  })

  it('refuses to delete an image referenced only by a Page block', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'p.png')
    await Page.create({
      key: 'biography',
      blocks: [{ type: 'image', image: up.body._id }],
    })
    const res = await agent.delete(`/api/admin/images/${up.body._id}`)
    expect(res.status).toBe(409)
    expect(await Image.countDocuments()).toBe(1)
  })
})

describe('GET /media', () => {
  it('serves a stored variant with an immutable cache header', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'c.png')
    const res = await request(createApp()).get(`/media/${up.body.variants.thumb.path}`)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toMatch(/immutable/)
  })

  it('refuses a path traversal attempt', async () => {
    const res = await request(createApp()).get('/media/../../etc/passwd')
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('never serves an archival original', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'd.png')
    const res = await request(createApp()).get(`/media/${up.body.variants.original.path}`)
    expect(res.status).toBe(404)
  })

  it('refuses a percent-encoded originals path (encoding bypass)', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'e.png')
    // express.static/`send` decode the path before touching disk, while
    // req.path stays raw; a literal-string check on req.path is bypassed by
    // percent-encoding the leading underscore of _originals.
    const encoded = up.body.variants.original.path.replace(/^_originals/, '%5Foriginals')
    const res = await request(createApp()).get(`/media/${encoded}`)
    expect(res.status).toBe(404)
  })
})
