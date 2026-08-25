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
// ONE logged-in agent for the whole file. `loginAgent()` performs a real
// login, and the login rate limiter is a module-level singleton shared by
// every app instance in the process -- sixteen logins against its limit of
// ten meant the later half of this file silently ran unauthenticated and
// failed on 401s that had nothing to do with what was being tested. Users
// are not touched by the beforeEach below, so one session lasts the file.
let agent

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  root = await mkdtemp(join(tmpdir(), 'media-api-'))
  process.env.MEDIA_ROOT = root
  await db.start()
  agent = await loginAgent()
})
afterAll(async () => { await db.stop(); await rm(root, { recursive: true, force: true }) })
beforeEach(async () => { await Image.deleteMany({}); await Article.deleteMany({}); await Page.deleteMany({}) })

const png = () => sharp({ create: { width: 900, height: 600, channels: 3, background: '#333' } }).png().toBuffer()
const bigger = () => sharp({ create: { width: 2600, height: 1800, channels: 3, background: '#777' } }).png().toBuffer()

describe('POST /api/admin/images', () => {
  it('stores an uploaded image and returns its variants', async () => {
    const res = await agent.post('/api/admin/images').attach('file', await png(), 'Porte.png')
    expect(res.status).toBe(201)
    expect(res.body.variants.thumb.width).toBe(600)
    expect(await Image.countDocuments()).toBe(1)
  })

  it('rejects a non-image upload', async () => {
    const res = await agent.post('/api/admin/images').attach('file', Buffer.from('#!/bin/sh'), 'evil.sh')
    expect(res.status).toBe(400)
  })

  it('requires authentication', async () => {
    const res = await request(createApp()).post('/api/admin/images').attach('file', await png(), 'a.png')
    expect(res.status).toBe(401)
  })

  it('rejects an oversized upload with 413, not a 500', async () => {
    const big = Buffer.alloc(31 * 1024 * 1024) // over the 30 MB multer limit
    const res = await agent.post('/api/admin/images').attach('file', big, 'big.png')
    expect(res.status).toBe(413)
    expect(res.body).toHaveProperty('error')
  })
})

describe('DELETE /api/admin/images/:id', () => {
  it('refuses to delete an image still used as a cover', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    await Article.create({ category: 'works', slug: { fr: 'a' }, title: { fr: 'A' }, cover: up.body._id })
    const res = await agent.delete(`/api/admin/images/${up.body._id}`)
    expect(res.status).toBe(409)
    expect(await Image.countDocuments()).toBe(1)
  })

  it('deletes an unused image', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'b.png')
    expect((await agent.delete(`/api/admin/images/${up.body._id}`)).status).toBe(200)
  })

  it('refuses to delete an image referenced only by a Page block', async () => {
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
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'd.png')
    const res = await request(createApp()).get(`/media/${up.body.variants.original.path}`)
    expect(res.status).toBe(404)
  })

  it('refuses a percent-encoded originals path (encoding bypass)', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'e.png')
    // express.static/`send` decode the path before touching disk, while
    // req.path stays raw; a literal-string check on req.path is bypassed by
    // percent-encoding the leading underscore of _originals.
    const encoded = up.body.variants.original.path.replace(/^_originals/, '%5Foriginals')
    const res = await request(createApp()).get(`/media/${encoded}`)
    expect(res.status).toBe(404)
  })
})

// Uploading a better scan as a NEW image means hunting down every article,
// gallery and cover pointing at the old one. Replacing keeps the document and
// its id, so every reference follows on its own.
describe('POST /api/admin/images/:id/replace', () => {
  it('swaps the file while keeping the id, so references still resolve', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'small.png')
    const article = await Article.create({
      category: 'works',
      title: { fr: 'Porte' },
      slug: { fr: 'porte' },
      cover: up.body._id,
    })

    const res = await agent
      .post(`/api/admin/images/${up.body._id}/replace`)
      .attach('file', await bigger(), 'better.png')

    expect(res.status).toBe(200)
    expect(res.body._id).toBe(up.body._id)
    expect(res.body.variants.original.width).toBe(2600)
    // The article was never touched and still points at the same image.
    const after = await Article.findById(article._id).lean()
    expect(String(after.cover)).toBe(up.body._id)
  })

  // The legend describes the work, not the file. Re-scanning a photograph
  // does not change what it is of.
  it('leaves the alt text alone', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    await agent.patch(`/api/admin/images/${up.body._id}`).send({ alt: { fr: 'Une porte', en: '' } })

    const res = await agent
      .post(`/api/admin/images/${up.body._id}/replace`)
      .attach('file', await bigger(), 'b.png')

    expect(res.body.alt.fr).toBe('Une porte')
  })

  // `filename` is the content hash and carries a unique index, so the same
  // file already stored under another image would collide on it. Say which
  // problem it is rather than surfacing a raw E11000.
  it('refuses a file the library already holds under another image', async () => {
    const a = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    const b = await agent.post('/api/admin/images').attach('file', await bigger(), 'b.png')

    const res = await agent
      .post(`/api/admin/images/${b.body._id}/replace`)
      .attach('file', await png(), 'again.png')

    expect(res.status).toBe(409)
    // The target is untouched: still its own file, not a.  
    const after = await Image.findById(b.body._id).lean()
    expect(after.filename).toBe(b.body.filename)
    expect(after.filename).not.toBe(a.body.filename)
  })

  it('rejects something that is not an image', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    const res = await agent
      .post(`/api/admin/images/${up.body._id}/replace`)
      .attach('file', Buffer.from('#!/bin/sh'), 'evil.sh')
    expect(res.status).toBe(400)
  })

  it('404s for an image that does not exist', async () => {
    const res = await agent
      .post('/api/admin/images/6a8a17dd7154182848de9b9b/replace')
      .attach('file', await png(), 'a.png')
    expect(res.status).toBe(404)
  })

  it('requires a session', async () => {
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    const res = await request(createApp())
      .post(`/api/admin/images/${up.body._id}/replace`)
      .attach('file', await bigger(), 'b.png')
    expect(res.status).toBe(401)
  })
})

// The library lists where each image is used, so the admin can say whether a
// resolution is enough -- a different number for a photograph opened
// fullscreen than for a bibliography cover at 30vw.
describe('GET /api/admin/images role', () => {
  it('reports the most demanding use of each image', async () => {
    const inGallery = await agent.post('/api/admin/images').attach('file', await png(), 'g.png')
    const inBiblio = await agent.post('/api/admin/images').attach('file', await bigger(), 'r.png')
    const nowhere = await agent
      .post('/api/admin/images')
      .attach('file', await sharp({ create: { width: 100, height: 100, channels: 3, background: '#111' } }).png().toBuffer(), 'n.png')

    await Article.create({
      category: 'works',
      title: { fr: 'A' },
      slug: { fr: 'a' },
      blocks: [{ type: 'gallery', items: [{ image: inGallery.body._id }] }],
    })
    await Page.create({
      key: 'bibliography',
      blocks: [{ type: 'references', items: [{ image: inBiblio.body._id }] }],
    })

    const res = await agent.get('/api/admin/images')
    const roleOf = (id) => res.body.items.find((i) => i._id === id).role
    expect(roleOf(inGallery.body._id)).toBe('fullscreen')
    expect(roleOf(inBiblio.body._id)).toBe('reference')
    expect(roleOf(nowhere.body._id)).toBe('unused')
  })
})
