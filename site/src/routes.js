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

export function routeFor(key, lang, slug) {
  const segment = SEGMENTS[key]?.[lang] ?? ''
  // `slug` can be a resolved string (most callers) or the raw `{fr, en}`
  // localized field. Slug is the one localized field on this project that
  // did NOT already follow the `en || fr` rule every other field uses --
  // an empty English slug used to build `/en/<section>` (the section
  // listing) instead of an article page. Resolving it the same way here
  // means every caller gets the fallback for free.
  const resolvedSlug = slug && typeof slug === 'object' ? slug[lang] || slug.fr : slug
  const parts = [lang === 'en' ? 'en' : null, segment || null, resolvedSlug || null].filter(Boolean)
  return `/${parts.join('/')}`
}

export function langFromPath(pathname) {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'fr'
}
