import { connect } from './db.js'
import { seedAdmin } from './lib/seedAdmin.js'

/**
 * Runs once at process startup, before the server accepts requests.
 *
 * Order matters: the JWT_SECRET check happens first and before any I/O, so a
 * misconfigured deployment fails immediately and loudly instead of booting
 * healthy and then crashing the process on the first login attempt.
 */
export async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  await connect()
  await seedAdmin({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
}
