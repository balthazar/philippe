import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { withDb } from './helpers/db.js'
import { bootstrap } from '../src/bootstrap.js'
import { User } from '../src/models/User.js'

const db = withDb()

beforeAll(async () => {
  await db.start()
})
afterAll(db.stop)

beforeEach(async () => {
  await User.deleteMany({})
  process.env.JWT_SECRET = 'test-secret'
  process.env.MONGO_URI = db.uri
  process.env.MONGO_DB = 'test'
  process.env.ADMIN_EMAIL = 'admin@example.com'
  process.env.ADMIN_PASSWORD = 'correct horse battery'
})

describe('bootstrap', () => {
  it('rejects when JWT_SECRET is unset, with a message naming JWT_SECRET', async () => {
    delete process.env.JWT_SECRET
    await expect(bootstrap()).rejects.toThrow(/JWT_SECRET/)
  })

  it('connects and creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD when JWT_SECRET is set', async () => {
    await bootstrap()
    const user = await User.findOne({ email: 'admin@example.com' })
    expect(user).not.toBeNull()
  })

  it('does not create a second user when called twice', async () => {
    await bootstrap()
    await bootstrap()
    expect(await User.countDocuments()).toBe(1)
  })
})
