import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { usePreloadImage } from '../usePreloadImage.js'

let created
const RealImage = globalThis.Image

beforeEach(() => {
  created = []
  globalThis.Image = class {
    constructor() { created.push(this); this._src = '' }
    set src(v) { this._src = v }
    get src() { return this._src }
  }
})
afterEach(() => { globalThis.Image = RealImage })

const Probe = ({ url }) => { usePreloadImage(url); return null }

describe('usePreloadImage', () => {
  it('fetches the url given to it', () => {
    render(<Probe url="/media/a/next-large.webp" />)
    expect(created.map((i) => i.src)).toContain('/media/a/next-large.webp')
  })

  // A single-image slider has no next image, and the current one is already
  // on screen -- requesting it again would be pure waste.
  it('fetches nothing for an empty url', () => {
    render(<Probe url="" />)
    expect(created).toHaveLength(0)
  })

  it('fetches again only when the url actually changes', () => {
    const { rerender } = render(<Probe url="/media/a.webp" />)
    rerender(<Probe url="/media/a.webp" />)
    expect(created).toHaveLength(1)
    rerender(<Probe url="/media/b.webp" />)
    expect(created).toHaveLength(2)
  })

  // Abandons an in-flight fetch rather than leaving it to land on a
  // component that is gone.
  it('drops the request on unmount', () => {
    const { unmount } = render(<Probe url="/media/a.webp" />)
    unmount()
    expect(created[0].src).toBe('')
  })
})
