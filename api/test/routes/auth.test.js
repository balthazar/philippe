import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { withDb } from '../helpers/db.js'
import { createApp } from '../../src/app.js'
import { seedAdmin } from '../../src/lib/seedAdmin.js'
import { User } from '../../src/models/User.js'

const db = withDb()
const app = () => createApp()

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  await db.start()
})
afterAll(db.stop)
beforeEach(async () => {
  await User.deleteMany({})
  await seedAdmin({ email: 'admin@example.com', password: 'correct horse battery' })
})

describe('seedAdmin', () => {
  it('does not create a second user when one already exists', async () => {
    await seedAdmin({ email: 'other@example.com', password: 'x' })
    expect(await User.countDocuments()).toBe(1)
  })

  it('stores a hash, never the password', async () => {
    const user = await User.findOne()
    expect(user.passwordHash).not.toContain('correct horse battery')
  })
})

describe('POST /api/auth/login', () => {
  it('sets an httpOnly cookie on success', async () => {
    const res = await request(app())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'correct horse battery' })
    expect(res.status).toBe(200)
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toMatch(/philippe_token=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const bad = await request(app()).post('/api/auth/login').send({ email: 'admin@example.com', password: 'nope' })
    const unknown = await request(app()).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope' })
    expect(bad.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(bad.body).toEqual(unknown.body)
  })

  it('succeeds behind a proxy that sets X-Forwarded-For', async () => {
    const res = await request(app())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.5')
      .send({ email: 'admin@example.com', password: 'correct horse battery' })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/philippe_token=/)
  })
})

describe('protected routes', () => {
  it('rejects a request with no cookie', async () => {
    const res = await request(app()).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('accepts a request with the login cookie', async () => {
    const agent = request.agent(app())
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
    const res = await agent.get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('admin@example.com')
  })

  it('rejects a mutation missing the CSRF header', async () => {
    const agent = request.agent(app())
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
    const res = await agent.post('/api/auth/password').send({ password: 'new password here' })
    expect(res.status).toBe(403)
  })
})
