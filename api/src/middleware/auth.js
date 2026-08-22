import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'

export const COOKIE_NAME = 'philippe_token'
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_VALUE = 'philippe-admin'

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '12h' })
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  }
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}

/**
 * A cross-site form post cannot set a custom header, and SameSite=Lax already
 * blocks the cookie on cross-site POSTs. Together this is sufficient CSRF
 * protection without a token round trip.
 */
export function requireCsrfHeader(req, res, next) {
  if (req.get(CSRF_HEADER) !== CSRF_VALUE) return res.status(403).json({ error: 'forbidden' })
  next()
}
