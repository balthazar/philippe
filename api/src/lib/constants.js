export const CATEGORIES = ['works', 'exhibitions', 'editions', 'public-orders']
export const PAGE_KEYS = ['home', 'works', 'exhibitions', 'biography', 'contact', 'bibliography', 'links', 'legal']
// Task 30, part 5: `heading` is retired. What used to be a heading block is
// now a `text` block carrying an <h2>/<h3> (see api/src/lib/sanitize.js's
// whitelist, and RichText.jsx's TipTap heading extension, restricted to
// those two levels -- never h1, which the article title itself owns).
// Task 39: `references` is a list of bibliography/link entries -- each an
// optional image, a citation (sanitized HTML, so a book title keeps its
// italics), and an optional URL. It is what turns the bibliography page from
// one long blob of anchors into a grid, and it is deliberately a BLOCK type
// rather than a model of its own: an entry is page content, ordered and
// edited exactly like every other block, and it inherits the block editor's
// existing image picker, drag-ordering and localization for free.
// `collections` is `references` with a different rendering, not a different
// shape: both are a list of {image, value, url}. It exists as its own type so
// the biography's twenty-one museum logos can be laid out as a monochrome
// grid of marks, where the bibliography's entries are cards of book covers
// and citations -- same data, two jobs, and no `variant` flag on a block to
// remember the meaning of.
export const BLOCK_TYPES = ['text', 'image', 'gallery', 'specs', 'references', 'collections']

// Mirrors site/src/routes.js's SEGMENTS: the api and site are separate
// deployables (see api/Dockerfile, k8s/*.yaml -- neither container has the
// other's source on disk at runtime), so this can't be a live cross-package
// import. Kept in sync by hand, the same way ArticleList.jsx/ArticleEditor.jsx
// already duplicate CATEGORY_LABELS for the identical reason.
export const SEGMENTS = {
  home: { fr: '', en: '' },
  works: { fr: 'oeuvres', en: 'works' },
  exhibitions: { fr: 'expositions', en: 'exhibitions' },
  biography: { fr: 'biographie', en: 'biography' },
  contact: { fr: 'contact', en: 'contact' },
  bibliography: { fr: 'bibliographie', en: 'bibliography' },
  links: { fr: 'liens', en: 'links' },
  legal: { fr: 'mentions-legales', en: 'terms' },
}

// Task 27, Part A: with articles living at the root (/:slug, /en/:slug), a
// slug equal to a section segment would shadow that section's route. Derived
// from SEGMENTS above rather than retyped, so this can never silently drift
// from the actual URL scheme -- plus a handful of structural path segments
// (the /en language prefix, /admin, /api, /media) that SEGMENTS doesn't
// carry at all but a root-level slug could just as easily collide with.
const STRUCTURAL_RESERVED_SLUGS = ['en', 'admin', 'api', 'media']

export const RESERVED_SLUGS = [
  ...new Set(
    Object.values(SEGMENTS)
      .flatMap((segment) => [segment.fr, segment.en])
      .filter(Boolean)
      .concat(STRUCTURAL_RESERVED_SLUGS)
  ),
]
