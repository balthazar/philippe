import { describe, it, expect } from 'vitest'
import { splitArticleLayout } from '../articleLayout.js'

const text = (v = 'x') => ({ type: 'text', value: v })
const heading = (v = 'h') => ({ type: 'heading', value: v, level: 2 })
const specs = () => ({ type: 'specs', items: [] })
const image = () => ({ type: 'image' })
const gallery = () => ({ type: 'gallery', items: [] })

describe('splitArticleLayout', () => {
  it('splits a text-then-media article (the works shape) into two columns', () => {
    const blocks = [text(), heading(), specs(), gallery()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(true)
    expect(result.text).toEqual([text(), heading(), specs()])
    expect(result.media).toEqual([gallery()])
  })

  it('treats a lone leading image the same as a gallery', () => {
    const blocks = [text(), image(), gallery()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(true)
    expect(result.media).toEqual([image(), gallery()])
  })

  it('falls back to a single column when text and media interleave', () => {
    // The multi-exhibition-per-year shape: heading+text+gallery, repeated.
    // Splitting this would separate each heading from its own gallery.
    const blocks = [heading(), text(), gallery(), heading(), text(), gallery()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(false)
    expect(result.text).toEqual(blocks)
    expect(result.media).toEqual([])
  })

  it('falls back to a single column when there is no media at all', () => {
    const blocks = [text(), heading()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(false)
    expect(result.text).toEqual(blocks)
  })

  it('falls back to a single column for an empty block list', () => {
    expect(splitArticleLayout([])).toEqual({ text: [], media: [], twoColumn: false })
  })
})
