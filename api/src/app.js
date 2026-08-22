import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth.js'
import { adminRouter } from './routes/admin.js'
import { publicRouter } from './routes/public.js'
import { mediaRouter } from './routes/media.js'
import { errorHandler } from './middleware/errors.js'

export function createApp() {
  const app = express()
  // One hop: Traefik is the only reverse proxy in front of this API in production.
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use('/media', mediaRouter())
  app.use('/api/auth', authRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api', publicRouter)
  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  // Must be mounted last: an error handler mounted before the routes never runs.
  app.use(errorHandler)
  return app
}
