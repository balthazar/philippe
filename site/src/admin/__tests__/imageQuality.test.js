import { describe, it, expect } from 'vitest'
import { assessImage, formatBytes, formatDimensions, QUALITY, NEEDED_LONG_EDGE } from '../imageQuality.js'

const image = (width, role, bytes = 1000) => ({
  role,
  variants: { original: { width, height: Math.round(width * 0.75), bytes } },
})

describe('assessImage', () => {
  // The pipeline caps served files at 2400px wide, and the lightbox both
  // serves that and zooms 2.5x into it, so a fullscreen image wants all of it.
  it('wants the full 2400 for anything reachable fullscreen', () => {
    expect(assessImage(image(2400, 'fullscreen')).quality).toBe(QUALITY.OK)
    expect(assessImage(image(2399, 'fullscreen')).quality).toBe(QUALITY.LOW)
  })

  // A bibliography entry is set at 30vw. Judging it against 2400 would flag
  // every cover in the archive as too small when each is comfortably sharp
  // where it actually appears.
  it('holds a reference-only image to a lower bar', () => {
    expect(assessImage(image(1000, 'reference')).quality).toBe(QUALITY.OK)
    expect(assessImage(image(999, 'reference')).quality).toBe(QUALITY.LOW)
    // The same file would be soft if it were ever opened fullscreen.
    expect(assessImage(image(1000, 'fullscreen')).quality).toBe(QUALITY.LOW)
  })

  it('reports the width it is measuring against, so the warning is actionable', () => {
    expect(assessImage(image(900, 'fullscreen'))).toMatchObject({ longEdge: 900, needed: 2400 })
    expect(assessImage(image(900, 'reference'))).toMatchObject({ longEdge: 900, needed: 1000 })
  })

  // An archival master is meant to have headroom over the largest served
  // variant. Only past twice the ceiling does surplus stop being headroom.
  it('calls an original oversized only past twice what can be shown', () => {
    expect(assessImage(image(4800, 'fullscreen')).quality).toBe(QUALITY.OK)
    expect(assessImage(image(4801, 'fullscreen')).quality).toBe(QUALITY.OVERSIZED)
    expect(assessImage(image(2001, 'reference')).quality).toBe(QUALITY.OVERSIZED)
  })

  it('judges an unplaced image by the demanding bar, since it could go anywhere', () => {
    expect(NEEDED_LONG_EDGE.unused).toBe(NEEDED_LONG_EDGE.fullscreen)
    expect(assessImage(image(1500, 'unused')).quality).toBe(QUALITY.LOW)
  })

  // The pipeline resizes by width, so a portrait scan keeps its full height:
  // 2242 x 2560 has every one of those 2560 pixels available fullscreen,
  // where height is the binding constraint anyway. Judged on width it would
  // read as 158px short. Across the real archive this is the difference
  // between flagging 164 images and flagging 54.
  it('measures the long edge, so a portrait is not penalised for its width', () => {
    const portrait = { role: 'fullscreen', variants: { original: { width: 2242, height: 2560 } } }
    expect(assessImage(portrait).quality).toBe(QUALITY.OK)
    expect(assessImage(portrait).longEdge).toBe(2560)
  })

  it('says nothing about an image whose dimensions are unknown', () => {
    expect(assessImage({ role: 'fullscreen' }).quality).toBe(QUALITY.OK)
    expect(assessImage(undefined).quality).toBe(QUALITY.OK)
  })

  // Older records predate the `variants.original` entry.
  it('falls back to the top-level width', () => {
    expect(assessImage({ role: 'fullscreen', width: 900, height: 600 }).quality).toBe(QUALITY.LOW)
  })
})

describe('formatBytes', () => {
  it('uses Mo past a megabyte, with a French decimal comma', () => {
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2,5 Mo')
  })

  it('uses whole Ko below that', () => {
    expect(formatBytes(1024 * 240)).toBe('240 Ko')
  })

  it('says nothing for an unknown size', () => {
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(undefined)).toBe('')
  })
})

describe('formatDimensions', () => {
  it('uses a true multiplication sign', () => {
    expect(formatDimensions(image(2560, 'fullscreen'))).toBe('2560 × 1920')
  })

  it('says nothing when the dimensions are unknown', () => {
    expect(formatDimensions({})).toBe('')
  })
})
