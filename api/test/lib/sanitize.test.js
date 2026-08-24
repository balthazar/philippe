import { describe, it, expect } from 'vitest'
import { sanitize, safeUrl } from '../../src/lib/sanitize.js'

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

// Task 39. A `references` item's url reaches the DOM as an href without ever
// passing through sanitize-html, so allowedSchemes never sees it. This is
// the check that stands in for it.
describe('safeUrl', () => {
  it('keeps absolute http, https and mailto URLs, trimmed', () => {
    expect(safeUrl('https://villamedici.it/programme/laltro-lato-de-philippe-gronon/'))
      .toBe('https://villamedici.it/programme/laltro-lato-de-philippe-gronon/')
    expect(safeUrl('http://archives.mamco.ch/x.html')).toBe('http://archives.mamco.ch/x.html')
    expect(safeUrl('mailto:info@philippegronon.com')).toBe('mailto:info@philippegronon.com')
    expect(safeUrl('  https://example.org/a  ')).toBe('https://example.org/a')
  })

  it('drops javascript:, however it is spelled', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('')
    // Leading whitespace and embedded control characters are what defeats a
    // naive startsWith() check; the URL parser strips them and still reports
    // the real protocol.
    expect(safeUrl('  javascript:alert(1)')).toBe('')
    expect(safeUrl('java\tscript:alert(1)')).toBe('')
    expect(safeUrl('java\nscript:alert(1)')).toBe('')
  })

  it('drops data: and other non-navigational schemes', () => {
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('')
    expect(safeUrl('vbscript:msgbox(1)')).toBe('')
    expect(safeUrl('file:///etc/passwd')).toBe('')
  })

  it('drops relative and malformed values rather than throwing', () => {
    // The bibliography's own WordPress export carried exactly this shape: a
    // document's name left where the URL should be.
    expect(safeUrl('Texte-Catherine-Perret-2010-Philippe-Gronon.-def')).toBe('')
    expect(safeUrl('/oeuvres')).toBe('')
    expect(safeUrl('')).toBe('')
    expect(safeUrl(undefined)).toBe('')
    expect(safeUrl(null)).toBe('')
    expect(safeUrl(42)).toBe('')
  })
})
