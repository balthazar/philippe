import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { withDb } from '../helpers/db.js'
import { loginAgent } from '../helpers/agent.js'
import { createApp } from '../../src/app.js'
import { Article } from '../../src/models/Article.js'
import { Page } from '../../src/models/Page.js'
import { User } from '../../src/models/User.js'
import { seedAdmin } from '../../src/lib/seedAdmin.js'

const db = withDb()
beforeAll(async () => { process.env.JWT_SECRET = 'test-secret'; await db.start() })
afterAll(db.stop)
beforeEach(async () => { await Article.deleteMany({}); await Page.deleteMany({}) })

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
})
