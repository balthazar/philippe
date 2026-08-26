/**
 * Accent- and case-insensitive, so "developpement" finds "Cuvette de
 * développement" and "ecritoire" finds "Écritoire". Nearly every legend in
 * this archive carries an accent, and a search that made the artist reproduce
 * them exactly would be a search he stops using.
 */
export const normalize = (text) =>
  String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Both languages at once: he should not have to know which one holds the word he remembers. */
export const searchableText = (image) => `${image?.alt?.fr || ''} ${image?.alt?.en || ''}`

/**
 * Every word of the query must appear somewhere in the text, in any order,
 * as a partial match.
 *
 * The legends are long and formulaic -- "Verso n°27, Portrait, Anonyme,
 * collection particulière, Malakoff - 2005, 42 x 36 cm" -- so the words worth
 * remembering are scattered through a sentence nobody is going to retype. A
 * single contiguous substring, which is what this used to be, meant "verso
 * 27" found nothing at all: the two words are separated by "n°" in every one
 * of them. Splitting on whitespace makes "ver 27" land on that image, which
 * is how someone actually searches for it.
 *
 * AND, not OR: each extra word narrows the result. With OR, typing more would
 * return more, which is the opposite of what a second word is for.
 */
export function matchesQuery(text, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const haystack = normalize(text)
  return tokens.every((token) => haystack.includes(token))
}
