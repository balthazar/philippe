import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'

/** Creates the first admin only when the collection is empty. Never overwrites. */
export async function seedAdmin({ email, password }) {
  if (!email || !password) return null
  if ((await User.countDocuments()) > 0) return null
  const passwordHash = await bcrypt.hash(password, 12)
  return User.create({ email, passwordHash })
}
