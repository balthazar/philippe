export const CATEGORIES = ['works', 'exhibitions', 'editions', 'public-orders']
export const PAGE_KEYS = ['home', 'works', 'exhibitions', 'biography', 'contact', 'bibliography', 'links', 'legal']
export const BLOCK_TYPES = ['text', 'heading', 'image', 'gallery', 'specs']

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
