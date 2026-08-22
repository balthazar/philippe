import request from 'supertest'
import { createApp } from '../../src/app.js'
import { seedAdmin } from '../../src/lib/seedAdmin.js'
import { User } from '../../src/models/User.js'
import { CSRF_VALUE } from '../../src/middleware/auth.js'

/** A logged-in supertest agent that always sends the CSRF header. */
export async function loginAgent() {
  await User.deleteMany({})
  await seedAdmin({ email: 'admin@example.com', password: 'correct horse battery' })
  const agent = request.agent(createApp())
  await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
  for (const method of ['get', 'post', 'patch', 'delete']) {
    const original = agent[method].bind(agent)
    agent[method] = (url) => original(url).set('X-Requested-With', CSRF_VALUE)
  }
  return agent
}
