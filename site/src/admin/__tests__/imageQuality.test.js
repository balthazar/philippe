import { describe, it, expect } from 'vitest'
import { assessImage, formatBytes, formatDimensions, QUALITY, DISPLAY } from '../imageQuality.js'

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

  // A bibliography entry is a thumbnail in a grid with no lightbox behind
  // it. There is nothing to open, so a bigger file would improve nothing
  // anyone can see -- and these are publishers' own cover scans, the size
  // they are. Flagging 18 of the archive's 20 would be 18 warnings with no
  // action behind any of them.
  it('never calls a reference-only image too small, however small it is', () => {
    expect(assessImage(image(600, 'reference')).quality).toBe(QUALITY.OK)
    expect(assessImage(image(141, 'reference')).quality).toBe(QUALITY.OK)
    // The same file WOULD be flagged if anything could open it fullscreen.
    expect(assessImage(image(600, 'fullscreen')).quality).toBe(QUALITY.LOW)
  })

  // It is still checked for the opposite fault: a 10000px master behind a
  // 400px thumbnail is real waste, and is what prompted the feature.
  it('still calls out a reference master far past the thumbnail it feeds', () => {
    expect(assessImage(image(2800, 'reference')).quality).toBe(QUALITY.OK)
    expect(assessImage(image(10000, 'reference')).quality).toBe(QUALITY.OVERSIZED)
  })

  it('reports the size it is measuring against, so the warning is actionable', () => {
    expect(assessImage(image(900, 'fullscreen'))).toMatchObject({ longEdge: 900, needed: 2400 })
  })

  // An archival master is meant to have headroom over the largest served
  // variant. Only past twice the ceiling does surplus stop being headroom.
  it('calls an original oversized only past twice what can be shown', () => {
    expect(assessImage(image(4800, 'fullscreen')).quality).toBe(QUALITY.OK)
    expect(assessImage(image(4801, 'fullscreen')).quality).toBe(QUALITY.OVERSIZED)
    expect(assessImage(image(4801, 'unused')).quality).toBe(QUALITY.OVERSIZED)
  })

  // The flag answers "too small for what it is shown at". An image shown
  // nowhere has no answer, and would only produce a warning about a
  // hypothetical. It gets judged the day it is placed.
  it('says nothing about the resolution of an image that is used nowhere', () => {
    expect(assessImage(image(300, 'unused')).quality).toBe(QUALITY.OK)
    // But an orphan carrying 10000px is taking up room either way.
    expect(assessImage(image(10000, 'unused')).quality).toBe(QUALITY.OVERSIZED)
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
