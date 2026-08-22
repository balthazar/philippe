import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import sharp from 'sharp'

const VARIANTS = { thumb: 600, medium: 1400, large: 2400 }

export function mediaPath(mediaRoot, filename) {
  return join(mediaRoot, filename)
}

/**
 * Re-encodes through sharp, which strips EXIF and neutralizes payloads hidden
 * in files claiming to be images. The client filename is never used on disk.
 */
export async function processImage(buffer, { originalName, mediaRoot }) {
  let meta
  try {
    meta = await sharp(buffer).metadata()
  } catch {
    throw new Error('unsupported image format')
  }
  if (!meta.width || !meta.height) throw new Error('unsupported image format')

  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  const dir = join(String(new Date().getFullYear()))
  const variants = {}

  const originalRel = join(dir, `${hash}-original.${meta.format === 'png' ? 'png' : 'jpg'}`)
  await write(mediaRoot, originalRel, buffer)
  variants.original = { path: originalRel, width: meta.width, height: meta.height, bytes: buffer.length }

  for (const [name, targetWidth] of Object.entries(VARIANTS)) {
    const width = Math.min(targetWidth, meta.width)
    const out = await sharp(buffer).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    const info = await sharp(out).metadata()
    const rel = join(dir, `${hash}-${name}.webp`)
    await write(mediaRoot, rel, out)
    variants[name] = { path: rel, width: info.width, height: info.height, bytes: out.length }
  }

  return {
    filename: hash,
    originalName,
    mime: `image/${meta.format}`,
    width: meta.width,
    height: meta.height,
    bytes: buffer.length,
    variants,
  }
}

async function write(root, rel, buf) {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, buf)
}
