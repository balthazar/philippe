/** A localized value is exactly {fr, en}. `fr` is the base and is never empty. */
export function localizedField() {
  return { fr: { type: String, default: '' }, en: { type: String, default: '' } }
}

export function isLocalized(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((k) => k === 'fr' || k === 'en')
}

export function localize(field, lang) {
  if (!field) return ''
  return field[lang] || field.fr || ''
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function resolveDoc(value, lang) {
  if (Array.isArray(value)) return value.map((v) => resolveDoc(v, lang))
  if (isLocalized(value)) return localize(value, lang)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDoc(v, lang)]))
  }
  return value
}
