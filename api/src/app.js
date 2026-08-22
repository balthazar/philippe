import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

export function createApp() {
  const app = express()
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  return app
}
