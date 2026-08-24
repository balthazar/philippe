import sanitizeHtml from 'sanitize-html'

// The whitelist is deliberately narrow: everything the source content uses and
// nothing else. `dl`/`dt`/`dd` carry provenance data and must survive.
// Task 30, part 5: h2/h3 added -- `heading` is retired as its own block
// type, so what used to be a heading is now a real <h2>/<h3> inside a `text`
// block's HTML, going through this same sanitizer. Deliberately NOT h1: the
// article title owns the page's only h1. Kept identical to migrate/
// elementor.js's own copy of this whitelist (duplicated there on purpose,
// migrate/ being a separate package).
const OPTIONS = {
  allowedTags: ['p', 'br', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'h2', 'h3'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
}

export function sanitize(html) {
  if (!html) return ''
  return sanitizeHtml(html, OPTIONS)
}

/**
 * Task 39. A `references` item's `url` is rendered straight into an `href`,
 * so unlike every other stored href on this site it never passes through
 * sanitize-html's own allowedSchemes check -- which is the only thing
 * standing between stored content and `javascript:` in an attribute. This is
 * that check, applied on write.
 *
 * Anything that is not an absolute http/https/mailto URL becomes '' (the
 * entry then renders as a plain card, not a link) rather than throwing: an
 * editor pasting a malformed URL should lose the link, not the citation they
 * just spent a minute typing.
 *
 * Parsed with the URL constructor rather than matched with a regular
 * expression: `javascript:` can be spelled with tabs, newlines and HTML
 * entities in ways a prefix test misses, and the parser is the same one the
 * browser will use.
 */
const URL_SCHEMES = ['http:', 'https:', 'mailto:']

export function safeUrl(url) {
  if (!url || typeof url !== 'string') return ''
  try {
    return URL_SCHEMES.includes(new URL(url.trim()).protocol) ? url.trim() : ''
  } catch {
    return ''
  }
}
