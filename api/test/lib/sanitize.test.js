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
})
