/**
 * The numeric sort years, read off the year the artist actually types.
 *
 * A work carries its year twice: `yearLabel`, the localized text printed
 * beside its title ("2013-2014", "2001-2022"), and `yearStart`/`yearEnd`,
 * the numbers the API sorts on. They were never independent -- the migration
 * derived the numbers from the label (parseYearLabel in migrate/extract.js),
 * and across the whole archive they still agree exactly: 37 of the 37
 * articles that have a label have yearStart equal to its first year and
 * yearEnd equal to its last, with no exceptions.
 *
 * So the editor asks for the label once and derives the rest, instead of
 * asking for the same year in three fields and trusting whoever fills them
 * in to keep them consistent by hand. That is the whole point: a second
 * field that must always equal the first is not a second field, it is an
 * opportunity to disagree.
 *
 * Read from `fr` (the base language, as everywhere else on this project),
 * falling back to `en` for an article that somehow only has that. A year is
 * a year in both, so there is nothing to translate and no reason to let the
 * two languages sort differently.
 */
const YEAR = /\d{4}/g

export function deriveSortYears(yearLabel) {
  const source = String(yearLabel?.fr || yearLabel?.en || '')
  const years = [...source.matchAll(YEAR)].map((match) => Number(match[0]))
  // Empty rather than 0: an article with no year printed (Tribunal du
  // commerce, Nice, the one in the archive) has no year to sort by either,
  // and 0 would file it below 1989 rather than nowhere.
  if (!years.length) return { yearStart: '', yearEnd: '' }
  // First and last, not first and second: "2010, 2012, 2015" is a real way
  // to write a span, and its end is the last year in it.
  return { yearStart: years[0], yearEnd: years[years.length - 1] }
}
