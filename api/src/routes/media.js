import { Router } from 'express'
import express from 'express'
import { ORIGINALS_PREFIX } from '../lib/imagePipeline.js'

export function mediaRouter(mediaRoot = process.env.MEDIA_ROOT || '/data/media') {
  const router = Router()
  // Archival masters are kept on disk but never served: they are the only
  // files that are not re-encoded, so they still carry their original metadata.
  router.use((req, res, next) =>
    req.path.split('/').includes(ORIGINALS_PREFIX) ? res.status(404).end() : next()
  )
  // Filenames are content hashes, so a given path's bytes never change.
  router.use(
    express.static(mediaRoot, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
      dotfiles: 'deny',
      index: false,
    })
  )
  return router
}
