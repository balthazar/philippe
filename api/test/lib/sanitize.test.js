import { describe, it, expect } from 'vitest'
import { sanitize } from '../../src/lib/sanitize.js'

describe('sanitize', () => {
  it('keeps the whitelisted structural tags', () => {
    const html = '<dl><dt>Tirage</dt><dd>3</dd></dl><p>Texte <em>oblique</em></p>'
    expect(sanitize(html)).toBe(html)
  })

  it('strips scripts, theme classes and inline styles', () => {
    expect(sanitize('<p class="elementor-x" style="color:red">Hi</p>')).toBe('<p>Hi</p>')
    expect(sanitize('<script>alert(1)</script><p>Hi</p>')).toBe('<p>Hi</p>')
  })

  it('keeps link hrefs but drops javascript: URLs', () => {
    expect(sanitize('<a href="https://x.com">x</a>')).toBe('<a href="https://x.com">x</a>')
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  // Task 30, part 5: `heading` is retired as its own block type; a heading
  // now lives inside a `text` block's HTML as a real <h2>/<h3>, so it goes
  // through this same sanitizer -- a genuine security improvement over the
  // old heading field, which was stored unsanitized (safe only because
  // every render path treated it as plain text).
  it('keeps h2 and h3', () => {
    const html = '<h2>Titre</h2><h3>Sous-section</h3><p>Texte</p>'
    expect(sanitize(html)).toBe(html)
  })

  // The article title owns the page's only h1 -- a text block can never
  // introduce a second one.
  it('strips h1, since the article title owns the page\'s only h1', () => {
    expect(sanitize('<h1>Pas ici</h1><p>Texte</p>')).toBe('Pas ici<p>Texte</p>')
  })
})
