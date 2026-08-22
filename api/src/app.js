import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth.js'

export function createApp() {
  const app = express()
  // One hop: Traefik is the only reverse proxy in front of this API in production.
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use('/api/auth', authRouter)
  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  return app
}
