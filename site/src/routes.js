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
  const parts = [lang === 'en' ? 'en' : null, segment || null, slug || null].filter(Boolean)
  return `/${parts.join('/')}`
}

export function langFromPath(pathname) {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'fr'
}
