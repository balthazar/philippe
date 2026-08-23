import { describe, it, expect } from 'vitest'
import { splitArticleLayout } from '../articleLayout.js'

// Task 30, part 5: the `heading` block type is retired -- what used to be a
// heading block is now a `text` block (carrying an <h2>/<h3>), so these
// fixtures use plain `text()`/`specs()` rather than a dedicated `heading()`
// helper.
const text = (v = 'x') => ({ type: 'text', value: v })
const specs = () => ({ type: 'specs', items: [] })
const image = () => ({ type: 'image' })
const gallery = () => ({ type: 'gallery', items: [] })

describe('splitArticleLayout', () => {
  it('splits a text-then-media article (the works shape) into two columns', () => {
    const blocks = [text(), specs(), gallery()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(true)
    expect(result.text).toEqual([text(), specs()])
    expect(result.media).toEqual([gallery()])
  })

  it('treats a lone leading image the same as a gallery', () => {
    const blocks = [text(), image(), gallery()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(true)
    expect(result.media).toEqual([image(), gallery()])
  })

  it('falls back to a single column when text and media interleave', () => {
    // The multi-exhibition-per-year shape: a heading-carrying text block,
    // more text, then a gallery, repeated. Splitting this would separate
    // each heading from its own gallery.
    const blocks = [text('<h2>Musée A</h2>'), text(), gallery(), text('<h2>Musée B</h2>'), text(), gallery()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(false)
    expect(result.text).toEqual(blocks)
    expect(result.media).toEqual([])
  })

  it('falls back to a single column when there is no media at all', () => {
    const blocks = [text(), specs()]
    const result = splitArticleLayout(blocks)
    expect(result.twoColumn).toBe(false)
    expect(result.text).toEqual(blocks)
  })

  it('falls back to a single column for an empty block list', () => {
    expect(splitArticleLayout([])).toEqual({ text: [], media: [], twoColumn: false })
  })
})
