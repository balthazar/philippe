import sanitizeHtml from 'sanitize-html'

// The whitelist is deliberately narrow: everything the source content uses and
// nothing else. `dl`/`dt`/`dd` carry provenance data and must survive.
const OPTIONS = {
  allowedTags: ['p', 'br', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
}

export function sanitize(html) {
  if (!html) return ''
  return sanitizeHtml(html, OPTIONS)
}
