import { Router } from 'express'
import express from 'express'
import { resolve, sep } from 'node:path'
import { ORIGINALS_PREFIX } from '../lib/imagePipeline.js'

export function mediaRouter(mediaRoot = process.env.MEDIA_ROOT || '/data/media') {
  const router = Router()
  const originalsDir = resolve(mediaRoot, ORIGINALS_PREFIX)

  // Archival masters are kept on disk but never served: they are the only files
  // that are not re-encoded, so they still carry their original metadata.
  // The check resolves the real path first, because req.path is NOT
  // percent-decoded while express.static decodes before touching disk, so a
  // raw-string check on the request is trivially bypassed with %5Foriginals.
  router.use((req, res, next) => {
    let decoded
    try {
      decoded = decodeURIComponent(req.path)
    } catch {
      return res.status(400).end() // malformed percent sequence
    }
    const target = resolve(mediaRoot, '.' + decoded)
    if (target === originalsDir || target.startsWith(originalsDir + sep)) return res.status(404).end()
    next()
  })
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
