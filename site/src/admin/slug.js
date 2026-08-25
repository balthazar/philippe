import { SEGMENTS } from '@/routes.js'

/**
 * Mirrors api/src/lib/slug.js's slugify, duplicated for the same reason
 * ArticleEditor.jsx duplicates CATEGORY_LABELS and api/src/lib/constants.js
 * duplicates SEGMENTS: the admin bundle and the API are separate deployables
 * with no shared source on disk at runtime.
 *
 * This copy has to stay character-for-character identical to the server's,
 * because the whole point of showing a derived slug in the editor is that it
 * IS the slug that gets stored -- the API only fills one in when the field
 * arrives empty, and never rewrites one it was given.
 */
export function slugify(text) {
  return String(text || '')
    .replace(/Œ/g, 'OE').replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * An article lives at the root (/:slug), so a slug equal to a section's own
 * URL segment would shadow that section. The API rejects those outright
 * (assertSlugNotReserved, 400) -- worth saying here rather than letting the
 * save fail, since the editor only ever shows its generic save error.
 *
 * Derived from routes.js rather than retyped, exactly as the API derives its
 * RESERVED_SLUGS from its own copy of SEGMENTS, plus the structural segments
 * SEGMENTS doesn't carry but a root-level slug could still collide with.
 */
const RESERVED = [
  ...new Set(
    Object.values(SEGMENTS)
      .flatMap((segment) => [segment.fr, segment.en])
      .filter(Boolean)
      .concat(['en', 'admin', 'api', 'media'])
  ),
]

/**
 * Where a slug stops being an address and starts being a paragraph. Not a
 * technical limit -- nothing breaks at 61 characters -- but past roughly this
 * length the tail is what gets elided in a search result or a shared link,
 * and the real archive has titles ("Complement d'Objet Direct, Proposition de
 * Philippe Gronon & d'Eric Schmitt, Galerie Dutko, Paris") that slugify to
 * more than twice it.
 */
export const MAX_SLUG_LENGTH = 60

// Words that carry no meaning in a URL. French first, since the French slug
// is the canonical one; the English ones matter for `slug.en` overrides.
const STOPWORDS = new Set([
  'a', 'au', 'aux', 'avec', 'dans', 'de', 'des', 'du', 'en', 'et', 'l', 'la',
  'le', 'les', 'par', 'pour', 'sur', 'un', 'une',
  'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to', 'with',
])

// Cutting mid-word gives "philippe-gronon-galerie-dut". Back up to the last
// separator instead, so every proposal is still made of whole words -- and
// drop a stopword left dangling at the new end, since "...-gronon-et" reads
// like the sentence was interrupted rather than shortened.
function truncateAtWord(slug, limit) {
  const cut = slug.length <= limit
    ? slug
    : (() => {
        const head = slug.slice(0, limit + 1)
        const lastDash = head.lastIndexOf('-')
        // No separator to back up to means the very first word is already
        // over the limit. There is no whole-word version of it, and half a
        // word is a worse address than a long one, so offer nothing.
        return lastDash > 0 ? head.slice(0, lastDash) : ''
      })()
  const words = cut.replace(/^-+|-+$/g, '').split('-').filter(Boolean)
  while (words.length > 1 && STOPWORDS.has(words[words.length - 1])) words.pop()
  return words.join('-')
}

/**
 * Shorter slugs to offer for an over-long one, best first: drop the words
 * that mean nothing in an address, keep the opening (a title's front is what
 * identifies it), or both. Only proposals that actually fit are returned, so
 * this can legitimately come back empty for a slug that is one long word.
 */
export function shortenSlug(value, limit = MAX_SLUG_LENGTH) {
  const slug = slugify(value)
  const words = slug.split('-').filter(Boolean)
  const stripped = words.filter((word) => !STOPWORDS.has(word)).join('-')
  const candidates = [stripped, truncateAtWord(slug, limit), truncateAtWord(stripped, limit)]
  return [...new Set(candidates)].filter((c) => c && c !== slug && c.length <= limit)
}

/**
 * What to say beside a slug field, as `{ message, suggestions }`, or null
 * when there is nothing to say. Suggestions are ready-to-use replacements,
 * offered as buttons rather than described in prose.
 *
 * Empty is never a problem: an empty French slug is what makes the API derive
 * (and de-duplicate) one, and an empty English slug means "use the French
 * one", which is the normal state for most of the archive.
 */
export function slugWarning(value) {
  const slug = String(value || '')
  if (!slug) return null

  if (RESERVED.includes(slug)) {
    return { message: `« ${slug} » est déjà l’adresse d’une section du site.`, suggestions: [] }
  }

  const canonical = slugify(slug)
  if (canonical !== slug) {
    return canonical
      ? { message: 'Minuscules, sans accent, mots séparés par des tirets :', suggestions: [canonical] }
      : { message: 'Ce slug ne contient aucune lettre ni chiffre utilisable dans une adresse.', suggestions: [] }
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    return {
      message: `${slug.length} caractères : au-delà de ${MAX_SLUG_LENGTH}, la fin de l’adresse est coupée dans les résultats de recherche.`,
      suggestions: shortenSlug(slug),
    }
  }

  return null
}
