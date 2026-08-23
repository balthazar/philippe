import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { withDb } from '../helpers/db.js'
import { loginAgent } from '../helpers/agent.js'
import { createApp } from '../../src/app.js'
import { Article } from '../../src/models/Article.js'
import { Page } from '../../src/models/Page.js'
import { Image } from '../../src/models/Image.js'
import { User } from '../../src/models/User.js'
import { seedAdmin } from '../../src/lib/seedAdmin.js'
import { COOKIE_NAME, CSRF_HEADER, CSRF_VALUE } from '../../src/middleware/auth.js'

const db = withDb()
beforeAll(async () => { process.env.JWT_SECRET = 'test-secret'; await db.start() })
afterAll(db.stop)
beforeEach(async () => { await Article.deleteMany({}); await Page.deleteMany({}) })

/**
 * An authenticated agent that never calls POST /auth/login. That route is
 * covered by loginAgent() everywhere else in this file, and its login
 * attempts share one process-wide rate limiter (10 per 15 minutes,
 * api/src/routes/auth.js); this file already runs exactly 10 logins across
 * its other tests, at that limiter's ceiling. Signing the same cookie
 * requireAuth verifies, rather than logging in again, adds authenticated
 * test coverage without spending another one of those 10 slots.
 */
async function directAgent() {
  await User.deleteMany({})
  const user = await seedAdmin({ email: 'direct@example.com', password: 'correct horse battery' })
  const cookie = `${COOKIE_NAME}=${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '12h' })}`
  const app = createApp()
  const withCsrf = (method) => (url) => request(app)[method](url).set('Cookie', cookie).set(CSRF_HEADER, CSRF_VALUE)
  return { get: (url) => request(app).get(url).set('Cookie', cookie), post: withCsrf('post'), patch: withCsrf('patch'), delete: withCsrf('delete') }
}

describe('admin articles', () => {
  it('requires authentication', async () => {
    expect((await request(createApp()).get('/api/admin/articles')).status).toBe(401)
  })

  it('rejects an unauthenticated mutation, not just an unauthenticated read', async () => {
    const res = await request(createApp())
      .post('/api/admin/articles')
      .set('X-Requested-With', 'philippe-admin')
      .send({ category: 'works', title: { fr: 'X' } })
    expect(res.status).toBe(401)
  })

  it('rejects an authenticated mutation that omits the CSRF header', async () => {
    // Built without loginAgent(), whose wrapper always sets the CSRF header:
    // this test needs a logged-in agent that genuinely omits it.
    await User.deleteMany({})
    await seedAdmin({ email: 'admin@example.com', password: 'correct horse battery' })
    const agent = request.agent(createApp())
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
    const res = await agent.post('/api/admin/articles').send({ category: 'works', title: { fr: 'X' } })
    expect(res.status).toBe(403)
  })

  it('lists drafts alongside published articles', async () => {
    await Article.create({ category: 'works', slug: { fr: 'd' }, title: { fr: 'D' }, status: 'draft' })
    const agent = await loginAgent()
    const res = await agent.get('/api/admin/articles')
    expect(res.body.items).toHaveLength(1)
  })

  it('returns raw localized objects, not resolved strings', async () => {
    await Article.create({ category: 'works', slug: { fr: 'r' }, title: { fr: 'Titre', en: '' } })
    const agent = await loginAgent()
    const res = await agent.get('/api/admin/articles')
    expect(res.body.items[0].title).toEqual({ fr: 'Titre', en: '' })
  })

  it('derives a unique French slug from the title when none is given', async () => {
    const agent = await loginAgent()
    await agent.post('/api/admin/articles').send({ category: 'works', title: { fr: 'Châssis-Presse' } })
    const second = await agent.post('/api/admin/articles').send({ category: 'works', title: { fr: 'Châssis-Presse' } })
    expect(second.body.slug.fr).toBe('chassis-presse-2')
  })

  it('sanitizes HTML in text blocks on write', async () => {
    const agent = await loginAgent()
    const res = await agent.post('/api/admin/articles').send({
      category: 'works',
      title: { fr: 'T' },
      blocks: [{ type: 'text', value: { fr: '<p class="x" style="color:red">Hi</p><script>alert(1)</script>' } }],
    })
    expect(res.body.blocks[0].value.fr).toBe('<p>Hi</p>')
  })

  it('reorders articles by the supplied id list', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'a' }, title: { fr: 'A' } })
    const b = await Article.create({ category: 'works', slug: { fr: 'b' }, title: { fr: 'B' } })
    const agent = await loginAgent()
    await agent.post('/api/admin/articles/reorder').send({ ids: [String(b._id), String(a._id)] })
    expect((await Article.findById(b._id)).position).toBe(0)
    expect((await Article.findById(a._id)).position).toBe(1)
  })

  it('deletes an article', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'x' }, title: { fr: 'X' } })
    const agent = await loginAgent()
    await agent.delete(`/api/admin/articles/${a._id}`)
    expect(await Article.countDocuments()).toBe(0)
  })

  // Regression (task 25, client feedback item 3): unlike GET and PATCH,
  // DELETE never checked whether anything was actually deleted, so deleting
  // an id that doesn't exist (already gone, or a typo) silently returned
  // the same { ok: true } as a real deletion.
  it('returns 404 deleting an article that does not exist, the same as GET and PATCH do', async () => {
    const agent = await directAgent()
    const missingId = '507f1f77bcf86cd799439011'
    expect(await Article.findById(missingId)).toBeNull()
    const res = await agent.delete(`/api/admin/articles/${missingId}`)
    expect(res.status).toBe(404)
  })

  // Express 4 does not forward a rejected promise from an async handler, so
  // without asyncHandler this CastError is an unhandled rejection: the
  // request never resolves and Node 24 terminates the process. This proves
  // the wrapper works rather than merely existing.
  it('returns a clean 400 for an invalid ObjectId instead of hanging or a 500', async () => {
    const agent = await loginAgent()
    const res = await agent.get('/api/admin/articles/not-an-id')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  }, 3000)

  // Regression for the cover-nulling bug (task 25, section 0): GET populates
  // `cover`; PATCH used to return a bare `.lean()` document without
  // populating it. The client reads `article.cover?._id`, so after one save
  // `article.cover` became a bare id string, `?._id` was undefined, and the
  // *next* save wrote `cover: null` -- silently dropping the article's cover
  // and, via api/src/routes/public.js's `cover: { $ne: null }` filter,
  // removing it from the homepage.
  it('PATCH populates cover the same way GET does, so a saved article keeps a shape the client can round-trip', async () => {
    const image = await Image.create({
      filename: 'cover.jpg',
      variants: { medium: { path: 'cover-medium.jpg', width: 800, height: 600 } },
    })
    const agent = await directAgent()
    const created = await agent
      .post('/api/admin/articles')
      .send({ category: 'works', title: { fr: 'T' }, cover: String(image._id) })

    const patched = await agent.patch(`/api/admin/articles/${created.body._id}`).send({ title: { fr: 'T2' } })

    const fetched = await agent.get(`/api/admin/articles/${created.body._id}`)
    // Same shape as GET: an object carrying the image's variants, not a bare id.
    expect(patched.body.cover).toMatchObject({ _id: String(image._id), filename: 'cover.jpg' })
    expect(patched.body.cover).toEqual(fetched.body.cover)
  })
})

describe('admin pages', () => {
  it('upserts a page by key', async () => {
    const agent = await loginAgent()
    const res = await agent.patch('/api/admin/pages/biography').send({ title: { fr: 'Biographie' } })
    expect(res.status).toBe(200)
    expect(await Page.countDocuments({ key: 'biography' })).toBe(1)
  })

  it('rejects an unknown page key', async () => {
    const agent = await loginAgent()
    expect((await agent.patch('/api/admin/pages/nonsense').send({})).status).toBe(400)
  })

  // Regression (task 25, section 7): GET /pages/:key used to be a bare
  // `.lean()` with no populate, unlike the sibling article route. Every
  // block.image came back as a bare id, so PageEditor's thumbnails didn't
  // render and its gallery merge (which compares image._id) matched the
  // wrong item. The biography page carries image blocks from the migration,
  // so this affects live content.
  it('populates block images on GET, the same way GET /articles/:id does', async () => {
    const image = await Image.create({
      filename: 'bio.jpg',
      variants: { medium: { path: 'bio-medium.jpg', width: 800, height: 600 } },
    })
    const agent = await directAgent()
    await agent.patch('/api/admin/pages/biography').send({
      title: { fr: 'Biographie' },
      blocks: [{ type: 'image', image: String(image._id), caption: { fr: '' }, size: 'wide' }],
    })

    const res = await agent.get('/api/admin/pages/biography')
    expect(res.body.blocks[0].image).toMatchObject({ _id: String(image._id), filename: 'bio.jpg' })
  })
})
