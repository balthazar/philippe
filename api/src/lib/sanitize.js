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
