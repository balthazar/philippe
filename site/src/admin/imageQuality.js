/**
 * Whether an image carries enough pixels for what the site does with it, and
 * how far past enough it goes.
 *
 * The numbers come from the pipeline and the layouts, not from taste:
 *
 *   - api/src/lib/imagePipeline.js resizes to thumb 600 / medium 1400 /
 *     large 2400 px wide, `withoutEnlargement`. So 2400 is the widest file
 *     the site can ever serve, and an original narrower than that produces a
 *     `large` variant narrower than that -- there is no way to get the
 *     missing detail back.
 *   - The lightbox and the homepage slideshow serve `large`, and the lightbox
 *     magnifies it 2.5x, which is reading detail out of the file rather than
 *     inventing it. Those want the full 2400.
 *   - A bibliography entry is set at 30vw on a wide screen. At a 1440px
 *     viewport that is 432 CSS px, so about 900 device px on a retina
 *     display: `medium` covers it with room to spare and `large` is never
 *     the sensible source.
 *
 * Hence one threshold per role rather than one for everything. Judging every
 * image against 2400 would flag every bibliography cover in the archive as
 * too small when each is comfortably sharp where it actually appears.
 *
 * Measured on the LONG EDGE, not the width, and that is not a detail. The
 * pipeline resizes by width, so a portrait scan of 2242 x 2560 yields a
 * `large` of 2242 x 2560 -- every one of those 2560 pixels available to a
 * reader who opens it fullscreen, where height is the binding constraint
 * anyway. Judged on width it would read as 158px short of the bar. Against
 * the real archive that single choice is the difference between flagging 164
 * images and flagging 54: the same 500 photographs, most of them 2560 on
 * their long edge and simply not all in landscape.
 *
 * 1000 for a reference is twice the ~480 CSS px a bibliography entry occupies
 * at 30vw on a wide screen -- the ordinary retina rule. Not 1400: that is
 * merely the width of the `medium` variant, which is generous for the slot
 * and would condemn nearly every cover in the bibliography.
 */
export const NEEDED_LONG_EDGE = { fullscreen: 2400, reference: 1000, unused: 2400 }

/**
 * Past this multiple of what a role needs, an original is carrying pixels the
 * site has no way to show. Two, not some tighter number: an archival master
 * is meant to have headroom over the largest served variant -- it is what a
 * future redesign or a print request is cut from -- and flagging everything
 * with any headroom at all would make the filter useless. At twice the
 * ceiling the surplus stops being headroom and starts being a file nobody
 * chose the size of.
 */
export const OVERSIZE_FACTOR = 2

export const QUALITY = { OK: 'ok', LOW: 'low', OVERSIZED: 'oversized' }

/**
 * Judged on the ORIGINAL, which is what the variants are cut from and what
 * actually sits on disk. The served files are capped by the pipeline, so an
 * oversized original costs storage rather than bandwidth -- worth surfacing,
 * but a different problem from a soft one, which costs the reader.
 */
export function assessImage(image) {
  const source = image?.variants?.original || image
  const longEdge = Math.max(source?.width || 0, source?.height || 0)
  const needed = NEEDED_LONG_EDGE[image?.role] ?? NEEDED_LONG_EDGE.fullscreen
  if (!longEdge) return { quality: QUALITY.OK, longEdge, needed }
  if (longEdge < needed) return { quality: QUALITY.LOW, longEdge, needed }
  if (longEdge > needed * OVERSIZE_FACTOR) return { quality: QUALITY.OVERSIZED, longEdge, needed }
  return { quality: QUALITY.OK, longEdge, needed }
}

/** "1,2 Mo". French decimal comma, and Mo/Ko, since the whole admin is in French. */
export function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
  return `${Math.round(bytes / 1024)} Ko`
}

/** "2560 × 1920". A true multiplication sign, not the letter x. */
export function formatDimensions(image) {
  const source = image?.variants?.original || image
  if (!source?.width || !source?.height) return ''
  return `${source.width} × ${source.height}`
}
