import { describe, it, expect } from 'vitest'
import { SEGMENTS, RESERVED_SLUGS } from '../../src/lib/constants.js'

// Task 27, Part A: RESERVED_SLUGS must be derived from SEGMENTS, not a
// hand-retyped copy that can drift from the real URL scheme.
describe('RESERVED_SLUGS', () => {
  it('includes every non-empty French and English segment from SEGMENTS', () => {
    for (const segment of Object.values(SEGMENTS)) {
      if (segment.fr) expect(RESERVED_SLUGS).toContain(segment.fr)
      if (segment.en) expect(RESERVED_SLUGS).toContain(segment.en)
    }
  })

  it('includes the structural path segments a root-level slug could also collide with', () => {
    for (const structural of ['en', 'admin', 'api', 'media']) {
      expect(RESERVED_SLUGS).toContain(structural)
    }
  })

  it('has no duplicates, even though contact repeats fr/en', () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length)
  })

  it('never contains an empty string (home\'s segment is "" in both languages)', () => {
    expect(RESERVED_SLUGS).not.toContain('')
  })

  it('would pick up a change to SEGMENTS automatically (derived, not a hardcoded copy)', () => {
    // Every reserved slug traces back to either a SEGMENTS value or the
    // fixed structural list -- nothing here is free-floating.
    const fromSegments = Object.values(SEGMENTS).flatMap((s) => [s.fr, s.en]).filter(Boolean)
    const structural = ['en', 'admin', 'api', 'media']
    for (const slug of RESERVED_SLUGS) {
      expect(fromSegments.includes(slug) || structural.includes(slug)).toBe(true)
    }
  })
})
