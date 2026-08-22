import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import sharp from 'sharp'

const VARIANTS = { thumb: 600, medium: 1400, large: 2400 }
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', tiff: 'tif', gif: 'gif', avif: 'avif' }

export function mediaPath(mediaRoot, filename) {
  return join(mediaRoot, filename)
}

/**
 * The thumb/medium/large variants are re-encoded through sharp, which strips
 * EXIF and neutralizes payloads hidden in files claiming to be images: those
 * three are safe to serve publicly. The original is kept byte-exact as the
 * archival master (re-encoding it would degrade it), so it retains whatever
 * metadata it arrived with, including EXIF/GPS. It is written under
 * `_originals/` and must never be served over HTTP.
 */
export async function processImage(buffer, { originalName, mediaRoot }) {
  let meta
  try {
    meta = await sharp(buffer).metadata()
  } catch {
    throw new Error('unsupported image format')
  }
  if (!meta.width || !meta.height) throw new Error('unsupported image format')

  // sharp reports raw pre-rotation dimensions; variants are produced with
  // .rotate(), which auto-orients. Use the display-true dimensions
  // everywhere so top-level fields agree with the variants.
  const swapped = meta.orientation >= 5 && meta.orientation <= 8
  const width = swapped ? meta.height : meta.width
  const height = swapped ? meta.width : meta.height

  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  const shard = hash.slice(0, 2)
  const variants = {}

  const ext = EXT[meta.format] || meta.format
  const originalRel = join('_originals', shard, `${hash}-original.${ext}`)
  await write(mediaRoot, originalRel, buffer)
  variants.original = { path: originalRel, width, height, bytes: buffer.length }

  for (const [name, targetWidth] of Object.entries(VARIANTS)) {
    const resizeWidth = Math.min(targetWidth, width)
    const out = await sharp(buffer).rotate().resize({ width: resizeWidth, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    const info = await sharp(out).metadata()
    const rel = join(shard, `${hash}-${name}.webp`)
    await write(mediaRoot, rel, out)
    variants[name] = { path: rel, width: info.width, height: info.height, bytes: out.length }
  }

  return {
    filename: hash,
    originalName,
    mime: `image/${meta.format}`,
    width,
    height,
    bytes: buffer.length,
    variants,
  }
}

async function write(root, rel, buf) {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, buf)
}
