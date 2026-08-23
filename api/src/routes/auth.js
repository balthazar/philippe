import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { User } from '#models/User.js'
import { COOKIE_NAME, signToken, cookieOptions, requireAuth, requireCsrfHeader } from '#middleware/auth.js'
import { asyncHandler } from '#middleware/asyncHandler.js'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'invalid credentials' },
})

export const authRouter = Router()

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {}
  const user = email ? await User.findOne({ email: String(email).toLowerCase() }) : null
  // Same response for unknown email and wrong password: no account enumeration.
  const ok = user ? await bcrypt.compare(String(password || ''), user.passwordHash) : false
  if (!ok) return res.status(401).json({ error: 'invalid credentials' })
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions())
  res.json({ email: user.email })
}))

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, (req, res) => res.json({ email: req.user.email }))

authRouter.post('/password', requireAuth, requireCsrfHeader, asyncHandler(async (req, res) => {
  const password = String(req.body?.password || '')
  if (password.length < 12) return res.status(400).json({ error: 'password must be at least 12 characters' })
  req.user.passwordHash = await bcrypt.hash(password, 12)
  await req.user.save()
  res.json({ ok: true })
}))
